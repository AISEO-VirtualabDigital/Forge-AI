// In-process multi-tasking agent runner.
//
// Picks up `queued` AgentTasks and runs them concurrently (up to the
// concurrency limit). Each task kind has a workflow that uses the active
// LLM provider + the existing analysis/generation logic. Tasks log progress
// and write their output back to the DB; the dashboard polls for updates.
//
// In the recommended split-the-weight deployment:
//   - VPS (8GB): runs this Next.js app + n8n + the DB. The runner lives here.
//   - Laptop (16GB): runs Ollama (the active openai_compat provider) +
//     opencode CLI. The runner on the VPS calls across the network to the
//     laptop for the heavy LLM work — so the VPS stays light.

import { db } from "@/lib/db";
import { llmChat } from "@/lib/llm";
import { invalidateProvider } from "@/lib/providers";
import { analyzeSeo, extractContentText } from "@/lib/seo";
import { analyzeEeat } from "@/lib/eeat";
import { blocksToHtml, buildPageContext } from "@/lib/ai-context";
import { createBlock } from "@/lib/blocks";
import type { AgentTask, Block, SeoConfig, TaskKind } from "@/lib/types";
import { wpBasicAuth, wpUrl } from "@/lib/wordpress";

const CONCURRENCY = 3;
const POLL_MS = 1500;

let running = false;
const activeTaskIds = new Set<string>();

interface TaskRow {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  input: string;
}

async function appendLog(taskId: string, line: string): Promise<unknown> {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}\n`;
  // SQLite doesn't support Prisma's `append` atomic operation, so we read the
  // current logs and write the concatenated string back. Task logs are small
  // and append frequency is low, so this read-modify-write is fine.
  const row = await db.agentTask.findUnique({
    where: { id: taskId },
    select: { logs: true },
  });
  return db.agentTask.update({
    where: { id: taskId },
    data: { logs: (row?.logs ?? "") + entry },
  });
}

function readProject(p: {
  blocks: string;
  seo: string;
  mode: string;
  name: string;
}) {
  let blocks: Block[] = [];
  let seo: SeoConfig = {} as SeoConfig;
  try {
    blocks = JSON.parse(p.blocks) as Block[];
  } catch {
    /* empty */
  }
  try {
    seo = JSON.parse(p.seo) as SeoConfig;
  } catch {
    /* empty */
  }
  return { blocks, seo, mode: p.mode, name: p.name };
}

async function runAuditSeo(task: TaskRow): Promise<Record<string, unknown>> {
  const proj = await db.project.findUnique({ where: { id: task.projectId } });
  if (!proj) throw new Error("project not found");
  const { blocks, seo } = readProject(proj);
  await appendLog(task.id, "Running SEO + EEAT + internal-links audit…");
  const seoAnalysis = analyzeSeo(blocks, seo);
  const eeat = analyzeEeat(blocks, seo);
  const content = extractContentText(blocks);
  await appendLog(task.id, `SEO score: ${seoAnalysis.score}/100, EEAT: ${eeat.score}/100, words: ${seoAnalysis.wordCount}`);

  // AI internal-link suggestions.
  let linkSuggestions: unknown[] = [];
  try {
    const ctx = buildPageContext(blocks, seo);
    const reply = await llmChat([
      {
        role: "assistant",
        content:
          "You are an SEO internal-linking specialist. Return a JSON array of { anchorText, suggestedTarget, reason }. Output ONLY the JSON array.",
      },
      {
        role: "user",
        content: `Page context:\n${ctx}\n\nContent:\n${content.slice(0, 2500)}`,
      },
    ]);
    const cleaned = reply.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) linkSuggestions = parsed.slice(0, 8);
    await appendLog(task.id, `AI suggested ${linkSuggestions.length} internal links`);
  } catch (e) {
    await appendLog(task.id, `Internal-link AI skipped: ${e instanceof Error ? e.message : "error"}`);
  }

  return {
    seoScore: seoAnalysis.score,
    eeatScore: eeat.score,
    wordCount: seoAnalysis.wordCount,
    checks: seoAnalysis.checks.filter((c) => c.status !== "pass").slice(0, 5),
    eeatChecks: eeat.checks.filter((c) => c.status !== "pass").slice(0, 5),
    linkSuggestions,
  };
}

async function runGeneratePage(task: TaskRow): Promise<Record<string, unknown>> {
  const input = JSON.parse(task.input || "{}") as { prompt?: string };
  const prompt = input.prompt ?? "a modern landing page for a SaaS product";
  const proj = await db.project.findUnique({ where: { id: task.projectId } });
  if (!proj) throw new Error("project not found");
  const { blocks, seo } = readProject(proj);
  const ctx = buildPageContext(blocks, seo);
  await appendLog(task.id, `Generating blocks for: "${prompt}"`);

  const reply = await llmChat([
    {
      role: "assistant",
      content:
        "You are a strict JSON block generator. Return a JSON array of { type, props, style } for the Forge builder. Valid types: nav, hero, heading, paragraph, button, image, card, features, quote, cta, divider, spacer, footer. Output ONLY the JSON array.",
    },
    { role: "assistant", content: `Current page context:\n${ctx}` },
    { role: "user", content: prompt },
  ]);
  const cleaned = reply
    .replace(/```(?:json)?\s*([\s\S]*?)```/i, "$1")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  const arrText = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let specs: { type: string; props?: Record<string, unknown>; style?: Record<string, unknown> }[] = [];
  try {
    specs = JSON.parse(arrText);
  } catch {
    await appendLog(task.id, "AI returned non-JSON; no blocks added");
    return { added: 0, error: "invalid JSON" };
  }

  const newBlocks: Block[] = specs
    .filter((s) => s && typeof s.type === "string")
    .map((spec) => {
      const b = createBlock(spec.type as Block["type"]);
      if (spec.props) b.props = { ...b.props, ...spec.props };
      if (spec.style) b.style = { ...b.style, ...spec.style };
      return b;
    });

  const existing = readProject(proj).blocks;
  const merged = [...existing, ...newBlocks];
  await db.project.update({
    where: { id: task.projectId },
    data: { blocks: JSON.stringify(merged) },
  });
  await appendLog(task.id, `Added ${newBlocks.length} blocks to project`);
  return { added: newBlocks.length, types: newBlocks.map((b) => b.type) };
}

async function runOptimizeMeta(task: TaskRow): Promise<Record<string, unknown>> {
  const proj = await db.project.findUnique({ where: { id: task.projectId } });
  if (!proj) throw new Error("project not found");
  const { blocks, seo } = readProject(proj);
  const content = extractContentText(blocks);
  await appendLog(task.id, "Asking AI to optimize title/description/keywords…");

  const reply = await llmChat([
    {
      role: "assistant",
      content:
        "You are an SEO consultant. Return ONLY JSON: { title, description, focusKeyword, keywords, ogTitle, ogDescription, jsonLd }. Title ≤60 chars, description 70-160 chars.",
    },
    {
      role: "user",
      content: `Current SEO:\n${JSON.stringify(seo, null, 2)}\n\nContent:\n${content.slice(0, 2500)}`,
    },
  ]);
  const cleaned = reply.replace(/```json\s*([\s\S]*?)```/i, "$1").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const objText = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let patch: Partial<SeoConfig> = {};
  try {
    patch = JSON.parse(objText);
  } catch {
    await appendLog(task.id, "AI returned non-JSON; SEO unchanged");
    return { updated: false };
  }
  const updated = { ...seo, ...patch };
  await db.project.update({
    where: { id: task.projectId },
    data: { seo: JSON.stringify(updated) },
  });
  await appendLog(task.id, `Updated SEO: title="${patch.title ?? "(unchanged)"}"`);
  return { updated: true, fields: Object.keys(patch) };
}

async function runInternalLinks(task: TaskRow): Promise<Record<string, unknown>> {
  const r = await runAuditSeo(task);
  return { linkSuggestions: r.linkSuggestions };
}

async function runPublishWp(task: TaskRow): Promise<Record<string, unknown>> {
  const input = JSON.parse(task.input || "{}") as {
    siteUrl?: string;
    username?: string;
    appPassword?: string;
    status?: string;
  };
  if (!input.siteUrl || !input.username || !input.appPassword) {
    throw new Error("WordPress credentials required in task input");
  }
  const proj = await db.project.findUnique({ where: { id: task.projectId } });
  if (!proj) throw new Error("project not found");
  const { blocks, seo } = readProject(proj);
  const html = blocksToHtml(blocks, seo);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1].trim() : html;
  await appendLog(task.id, `Publishing to ${input.siteUrl} as ${input.status ?? "draft"}…`);

  const res = await fetch(
    wpUrl(
      { siteUrl: input.siteUrl, username: input.username, appPassword: input.appPassword },
      "/wp-json/wp/v2/posts",
    ),
    {
      method: "POST",
      headers: {
        Authorization: wpBasicAuth({
          siteUrl: input.siteUrl,
          username: input.username,
          appPassword: input.appPassword,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: seo.title || proj.name,
        content,
        status: input.status ?? "draft",
        excerpt: seo.description,
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    await appendLog(task.id, `WP publish failed: ${res.status}`);
    throw new Error(`WP returned ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  await appendLog(task.id, `Published as post #${data.id}: ${data.link}`);
  return { postId: data.id, link: data.link, status: data.status };
}

async function runCustom(task: TaskRow): Promise<Record<string, unknown>> {
  const input = JSON.parse(task.input || "{}") as { prompt?: string };
  const prompt = input.prompt ?? "Summarize the current project state";
  const proj = await db.project.findUnique({ where: { id: task.projectId } });
  if (!proj) throw new Error("project not found");
  const { blocks, seo } = readProject(proj);
  const ctx = buildPageContext(blocks, seo);
  await appendLog(task.id, `Running custom agent prompt…`);
  const reply = await llmChat([
    {
      role: "assistant",
      content:
        "You are a Forge agent. Analyze the project and respond with a concise, actionable summary. If the user asks for changes, suggest them clearly.",
    },
    { role: "assistant", content: `Project context:\n${ctx}` },
    { role: "user", content: prompt },
  ]);
  await appendLog(task.id, `Agent replied (${reply.length} chars)`);
  return { reply };
}

const DISPATCH: Record<
  TaskKind,
  (task: TaskRow) => Promise<Record<string, unknown>>
> = {
  audit_seo: runAuditSeo,
  generate_page: runGeneratePage,
  optimize_meta: runOptimizeMeta,
  internal_links: runInternalLinks,
  publish_wp: runPublishWp,
  custom: runCustom,
};

async function runOne(task: TaskRow): Promise<void> {
  activeTaskIds.add(task.id);
  try {
    await db.agentTask.update({
      where: { id: task.id },
      data: { status: "running", startedAt: new Date() },
    });
    await appendLog(task.id, `Starting ${task.kind} task`);

    const handler = DISPATCH[task.kind as TaskKind] ?? runCustom;
    const output = await handler(task);

    await db.agentTask.update({
      where: { id: task.id },
      data: {
        status: "done",
        output: JSON.stringify(output),
        finishedAt: new Date(),
      },
    });
    await appendLog(task.id, `Task completed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await appendLog(task.id, `Task failed: ${msg}`);
    await db.agentTask.update({
      where: { id: task.id },
      data: {
        status: "failed",
        output: JSON.stringify({ error: msg }),
        finishedAt: new Date(),
      },
    });
  } finally {
    activeTaskIds.delete(task.id);
  }
}

async function tick(): Promise<void> {
  // If at concurrency limit, wait.
  if (activeTaskIds.size >= CONCURRENCY) return;
  // Pick the highest-priority queued task.
  const next = await db.agentTask.findFirst({
    where: { status: "queued" },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  if (!next) return;
  // Claim it atomically (mark running in a txn so two ticks don't grab it).
  try {
    await db.agentTask.update({
      where: { id: next.id, status: "queued" },
      data: { status: "running" },
    });
  } catch {
    return; // someone else grabbed it
  }
  void runOne({
    id: next.id,
    projectId: next.projectId,
    kind: next.kind,
    title: next.title,
    input: next.input,
  });
}

/**
 * Start the background poller. Idempotent — safe to call from multiple
 * boot paths (it's called once on first API request via ensureRunner).
 */
export function startRunner(): void {
  if (running) return;
  running = true;
  // Invalidate provider cache periodically so config changes take effect.
  setInterval(() => invalidateProvider(), 60000).unref?.();
  const loop = async () => {
    while (running) {
      try {
        await tick();
      } catch {
        /* ignore — keep looping */
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  };
  void loop();
}

let booted = false;
/**
 * Kick off the runner on first server activity. Called from API routes.
 */
export function ensureRunner(): void {
  if (booted) return;
  booted = true;
  startRunner();
}

/**
 * Get current runner stats (for the dashboard).
 */
export function runnerStats() {
  return {
    running: activeTaskIds.size,
    concurrency: CONCURRENCY,
    activeTaskIds: [...activeTaskIds],
  };
}
