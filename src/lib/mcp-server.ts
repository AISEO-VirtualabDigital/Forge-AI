// Forge MCP (Model Context Protocol) server.
//
// Exposes Forge's builder + SEO + EEAT + agent capabilities as typed MCP
// tools/resources/prompts so external clients (Claude Desktop, Cline, Cursor,
// n8n MCP nodes, the `mcp` CLI) can drive Forge projects over the standard
// Streamable HTTP transport at /api/mcp.
//
// Architecture:
//   - All tool/resource/prompt definitions live in a static TOOLS table so the
//     dashboard can render the catalog (via listAllTools()) without
//     instantiating an McpServer.
//   - buildForgeMcpServer() wires that table into a fresh McpServer instance.
//     A fresh server is built per HTTP request because the SDK's
//     Protocol.connect() throws "Already connected" if the same server is
//     re-used across requests — this is the official SDK stateless pattern
//     (see @modelcontextprotocol/sdk examples/simpleStatelessStreamableHttp).
//   - getForgeMcpServer() is the factory the route handler calls per request.
//
// Reuses existing logic — does NOT re-implement:
//   - db (Prisma)             → src/lib/db
//   - analyzeSeo/extractText  → src/lib/seo
//   - analyzeEeat             → src/lib/eeat
//   - createBlock/BLOCK_DEFS → src/lib/blocks
//   - blocksToHtml/buildCtx   → src/lib/ai-context
//   - llmChat                 → src/lib/llm
//   - ensureRunner            → src/lib/task-runner
//   - invalidateProvider      → src/lib/providers

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { analyzeEeat } from "@/lib/eeat";
import { analyzeSeo, DEFAULT_SEO } from "@/lib/seo";
import { createBlock } from "@/lib/blocks";
import { blocksToHtml, buildPageContext } from "@/lib/ai-context";
import { extractJsonArray, stripFences } from "@/lib/json-utils";
import { llmChat } from "@/lib/llm";
import { ensureRunner } from "@/lib/task-runner";
import { invalidateProvider } from "@/lib/providers";
import type { Block, BlockType, SeoConfig, TaskKind } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLOCK_TYPES: BlockType[] = [
  "nav", "hero", "heading", "paragraph", "button", "image",
  "card", "features", "quote", "cta", "divider", "spacer", "footer",
];

const TASK_KINDS: TaskKind[] = [
  "audit_seo", "generate_page", "optimize_meta",
  "internal_links", "publish_wp", "custom",
];

/** Parse the JSON `blocks` column of a Project row, defaulting to []. */
function readBlocks(raw: string | null | undefined): Block[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Block[]) : [];
  } catch {
    return [];
  }
}

/** Parse the JSON `seo` column of a Project row, defaulting to {}. */
function readSeo(raw: string | null | undefined): SeoConfig {
  if (!raw) return {} as SeoConfig;
  try {
    return JSON.parse(raw) as SeoConfig;
  } catch {
    return {} as SeoConfig;
  }
}

/**
 * Coerce a partial/stored SEO config into a complete SeoConfig by filling in
 * any missing fields with the Forge defaults. The downstream analyzers and
 * HTML renderer (analyzeSeo / analyzeEeat / blocksToHtml) assume a complete
 * SeoConfig and crash on undefined fields like `seo.jsonLd.trim()`, so every
 * entry point that reads SEO from the DB must run it through this helper.
 */
function withDefaultSeo(stored: Partial<SeoConfig> | null | undefined): SeoConfig {
  return { ...DEFAULT_SEO, ...(stored ?? {}) };
}

/** Parse a JSON column into an arbitrary object. */
function readJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (await db.project.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

/** Load a project or throw a descriptive error. */
async function requireProject(projectId: string) {
  const proj = await db.project.findUnique({ where: { id: projectId } });
  if (!proj) throw new Error(`Project not found: ${projectId}`);
  return proj;
}

// ---------------------------------------------------------------------------
// Tool catalog — static table consumed by listAllTools() + buildForgeMcpServer
// ---------------------------------------------------------------------------

export interface ToolCatalogEntry {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  run: ToolHandler;
}

// ---- Tool 1: forge_list_projects -------------------------------------------
async function toolListProjects(): Promise<unknown> {
  const rows = await db.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, slug: true, mode: true,
      blocks: true, updatedAt: true,
    },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    mode: p.mode,
    blockCount: readBlocks(p.blocks).length,
    updatedAt: p.updatedAt.toISOString(),
  }));
}

// ---- Tool 2: forge_get_project --------------------------------------------
async function toolGetProject(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const proj = await requireProject(projectId);
  return {
    id: proj.id,
    name: proj.name,
    slug: proj.slug,
    mode: proj.mode,
    blocks: readBlocks(proj.blocks),
    seo: readSeo(proj.seo),
    customCode: proj.customCode,
    updatedAt: proj.updatedAt.toISOString(),
  };
}

// ---- Tool 3: forge_create_project -----------------------------------------
async function toolCreateProject(args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.name ?? "Untitled Project").trim() || "Untitled Project";
  const blocks = Array.isArray(args.blocks) ? (args.blocks as Block[]) : [];
  // Merge the optional SEO patch against DEFAULT_SEO so the stored config is
  // always complete (the analyzers/renderer assume a full SeoConfig).
  const seoPatch = (args.seo as Partial<SeoConfig> | undefined) ?? {};
  const seo = withDefaultSeo(seoPatch);
  const slug = await ensureUniqueSlug(slugify(name));
  const created = await db.project.create({
    data: {
      name,
      slug,
      blocks: JSON.stringify(blocks),
      seo: JSON.stringify(seo),
      mode: "dragdrop",
    },
  });
  return { projectId: created.id };
}

// ---- Tool 4: forge_update_blocks ------------------------------------------
async function toolUpdateBlocks(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const blocks = Array.isArray(args.blocks) ? (args.blocks as Block[]) : [];
  await requireProject(projectId);
  await db.project.update({
    where: { id: projectId },
    data: { blocks: JSON.stringify(blocks) },
  });
  return { ok: true, blockCount: blocks.length };
}

// ---- Tool 5: forge_add_block ----------------------------------------------
async function toolAddBlock(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const type = String(args.type ?? "") as BlockType;
  if (!BLOCK_TYPES.includes(type)) {
    throw new Error(`Invalid block type: ${type}. Valid: ${BLOCK_TYPES.join(", ")}`);
  }
  const propsOverride = (args.props as Record<string, unknown> | undefined) ?? {};
  const styleOverride = (args.style as Record<string, unknown> | undefined) ?? {};
  const index = typeof args.index === "number" ? args.index : undefined;

  const proj = await requireProject(projectId);
  const blocks = readBlocks(proj.blocks);

  const block = createBlock(type);
  block.props = { ...block.props, ...propsOverride } as Block["props"];
  block.style = { ...block.style, ...styleOverride } as Block["style"];

  const insertAt = typeof index === "number" && index >= 0 && index <= blocks.length
    ? index
    : blocks.length;
  blocks.splice(insertAt, 0, block);

  await db.project.update({
    where: { id: projectId },
    data: { blocks: JSON.stringify(blocks) },
  });
  return { blockId: block.id, blockCount: blocks.length };
}

// ---- Tool 6: forge_update_seo ---------------------------------------------
async function toolUpdateSeo(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const patch = (args.seo as Partial<SeoConfig> | undefined) ?? {};
  const proj = await requireProject(projectId);
  // Merge against DEFAULT_SEO too so an old project with partial SEO still
  // produces a complete config after the patch.
  const merged: SeoConfig = withDefaultSeo({ ...readSeo(proj.seo), ...patch });
  await db.project.update({
    where: { id: projectId },
    data: { seo: JSON.stringify(merged) },
  });
  return { seo: merged };
}

// ---- Tool 7: forge_analyze_seo --------------------------------------------
async function toolAnalyzeSeo(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const proj = await requireProject(projectId);
  const blocks = readBlocks(proj.blocks);
  const seo = withDefaultSeo(readSeo(proj.seo));
  const seoAnalysis = analyzeSeo(blocks, seo);
  const eeat = analyzeEeat(blocks, seo);
  return {
    seoScore: seoAnalysis.score,
    eeatScore: eeat.score,
    wordCount: seoAnalysis.wordCount,
    failingChecks: seoAnalysis.checks
      .filter((c) => c.status !== "pass")
      .map((c) => `${c.id}: ${c.detail}`),
    eeatChecks: eeat.checks
      .filter((c) => c.status !== "pass")
      .map((c) => `${c.dimension}/${c.id}: ${c.detail}`),
  };
}

// ---- Tool 8: forge_generate_blocks (LLM) ----------------------------------
const BLOCK_GEN_SYSTEM_PROMPT = `You are a strict JSON-only block generator for the Forge website builder.
Given the user's prompt and a description of the page they are editing, return a JSON ARRAY of block specifications to ADD to the canvas.

Each array element MUST be an object with this exact shape:
{
  "type": "<BlockType>",
  "props": { ... },
  "style": { "align": "left"|"center"|"right", "background": "...", "padding": "...", "rounded": "...", "extraClass": "..." }
}

Valid block types: nav, hero, heading, paragraph, button, image, card, features, quote, cta, divider, spacer, footer.

Style guidelines:
- Use real Tailwind utility classes for background (e.g. "bg-muted", "bg-primary"), padding (e.g. "py-20 px-6"), rounded (e.g. "rounded-xl"), and extraClass (e.g. "border shadow-sm").
- For images, ALWAYS use a real working Unsplash photo URL (https://images.unsplash.com/photo-XXXX?w=1200&q=80) and a concrete descriptive alt.

Output ONLY the JSON array. No prose, no markdown fences, no trailing commas.`;

async function toolGenerateBlocks(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) throw new Error("prompt is required");

  const proj = await requireProject(projectId);
  const blocks = readBlocks(proj.blocks);
  const seo = withDefaultSeo(readSeo(proj.seo));
  const ctx = buildPageContext(blocks, seo);

  const reply = await llmChat([
    { role: "assistant", content: BLOCK_GEN_SYSTEM_PROMPT },
    {
      role: "assistant",
      content:
        "Current page context (for reference — do not duplicate existing blocks unless asked):\n\n" +
        ctx,
    },
    { role: "user", content: prompt },
  ]);

  const cleaned = stripFences(reply);
  const arrayText = extractJsonArray(cleaned) ?? cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch {
    return { added: 0, types: [], error: "Model did not return valid JSON" };
  }
  if (!Array.isArray(parsed)) {
    return { added: 0, types: [], error: "Expected a JSON array of block specs" };
  }

  const newBlocks: Block[] = [];
  const types: string[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const spec = item as Record<string, unknown>;
    const type = String(spec.type ?? "") as BlockType;
    if (!BLOCK_TYPES.includes(type)) continue;
    const b = createBlock(type);
    if (spec.props && typeof spec.props === "object") {
      b.props = { ...b.props, ...(spec.props as Record<string, unknown>) } as Block["props"];
    }
    if (spec.style && typeof spec.style === "object") {
      b.style = { ...b.style, ...(spec.style as Record<string, unknown>) } as Block["style"];
    }
    newBlocks.push(b);
    types.push(type);
  }

  const merged = [...blocks, ...newBlocks];
  await db.project.update({
    where: { id: projectId },
    data: { blocks: JSON.stringify(merged) },
  });
  return { added: newBlocks.length, types };
}

// ---- Tool 9: forge_export_html --------------------------------------------
async function toolExportHtml(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const proj = await requireProject(projectId);
  const blocks = readBlocks(proj.blocks);
  const seo = withDefaultSeo(readSeo(proj.seo));
  return { html: blocksToHtml(blocks, seo) };
}

// ---- Tool 10: forge_create_task -------------------------------------------
async function toolCreateTask(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  const kind = String(args.kind ?? "") as TaskKind;
  if (!TASK_KINDS.includes(kind)) {
    throw new Error(`Invalid task kind: ${kind}. Valid: ${TASK_KINDS.join(", ")}`);
  }
  await requireProject(projectId);
  const title = typeof args.title === "string" && args.title.trim()
    ? args.title.trim()
    : kind;
  const input = (args.input as Record<string, unknown> | undefined) ?? {};

  const task = await db.agentTask.create({
    data: {
      projectId,
      kind,
      title,
      input: JSON.stringify(input),
    },
  });
  // Kick the runner so queued tasks start draining.
  ensureRunner();
  return { taskId: task.id, status: task.status };
}

// ---- Tool 11: forge_list_tasks ---------------------------------------------
async function toolListTasks(args: Record<string, unknown>): Promise<unknown> {
  const projectId = String(args.projectId ?? "");
  await requireProject(projectId);
  const rows = await db.agentTask.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return rows.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    title: t.title,
    createdAt: t.createdAt.toISOString(),
  }));
}

// ---- Tool 12: forge_get_task ----------------------------------------------
async function toolGetTask(args: Record<string, unknown>): Promise<unknown> {
  const taskId = String(args.taskId ?? "");
  const task = await db.agentTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return {
    id: task.id,
    projectId: task.projectId,
    kind: task.kind,
    status: task.status,
    priority: task.priority,
    title: task.title,
    input: readJson(task.input, {}),
    output: readJson(task.output, {}),
    logs: task.logs,
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.finishedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

// ---- Tool 13: forge_list_providers ----------------------------------------
async function toolListProviders(): Promise<unknown> {
  const rows = await db.providerConfig.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    baseUrl: r.baseUrl,
    model: r.model,
    // Mask the API key — never exfiltrate the real secret over MCP.
    apiKey: r.apiKey ? "•••••" : null,
    active: r.active,
    healthy: r.healthy,
    lastCheck: r.lastCheck?.toISOString() ?? null,
  }));
}

// ---- Tool 14: forge_set_active_provider -----------------------------------
async function toolSetActiveProvider(args: Record<string, unknown>): Promise<unknown> {
  const providerId = String(args.providerId ?? "");
  const exists = await db.providerConfig.findUnique({ where: { id: providerId } });
  if (!exists) throw new Error(`Provider not found: ${providerId}`);
  await db.providerConfig.updateMany({
    where: { active: true },
    data: { active: false },
  });
  await db.providerConfig.update({
    where: { id: providerId },
    data: { active: true },
  });
  invalidateProvider();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Static catalog consumed by the dashboard's tool-catalog widget.
// ---------------------------------------------------------------------------

const TOOL_DEFS: ToolDef[] = [
  {
    name: "forge_list_projects",
    description:
      "List all Forge projects with summary info (id, name, slug, mode, blockCount, updatedAt).",
    schema: {},
    run: toolListProjects,
  },
  {
    name: "forge_get_project",
    description:
      "Get the full project record — blocks (Block[]), seo (SeoConfig), mode, customCode.",
    schema: { projectId: z.string().describe("The Forge project ID") },
    run: toolGetProject,
  },
  {
    name: "forge_create_project",
    description:
      "Create a new Forge project. Returns { projectId }. Optionally seed it with blocks + seo.",
    schema: {
      name: z.string().describe("Display name for the new project"),
      blocks: z.array(z.any()).optional().describe("Optional initial Block[] to seed the project"),
      seo: z.record(z.string(), z.any()).optional().describe("Optional initial SeoConfig patch"),
    },
    run: toolCreateProject,
  },
  {
    name: "forge_update_blocks",
    description:
      "Replace a project's blocks array entirely. Pass the full Block[] you want to store.",
    schema: {
      projectId: z.string(),
      blocks: z.array(z.any()).describe("Full Block[] to store (replaces existing)"),
    },
    run: toolUpdateBlocks,
  },
  {
    name: "forge_add_block",
    description:
      "Create a single block of the given type and insert it into a project. Merges optional props/style over the block's defaults. Inserts at `index` (or appends).",
    schema: {
      projectId: z.string(),
      type: z.enum([
        "nav", "hero", "heading", "paragraph", "button", "image",
        "card", "features", "quote", "cta", "divider", "spacer", "footer",
      ]),
      props: z.record(z.string(), z.any()).optional(),
      style: z.record(z.string(), z.any()).optional(),
      index: z.number().int().optional().describe("Insert position (default: append)"),
    },
    run: toolAddBlock,
  },
  {
    name: "forge_update_seo",
    description:
      "Merge a partial SeoConfig patch into the project's stored SEO. Returns the merged result.",
    schema: {
      projectId: z.string(),
      seo: z.record(z.string(), z.any()).describe("Partial SeoConfig patch"),
    },
    run: toolUpdateSeo,
  },
  {
    name: "forge_analyze_seo",
    description:
      "Run the deterministic SEO + EEAT analyzers against the project's current blocks/seo. Returns scores, word count, and lists of failing checks.",
    schema: { projectId: z.string() },
    run: toolAnalyzeSeo,
  },
  {
    name: "forge_generate_blocks",
    description:
      "Use the active LLM provider to generate Forge blocks from a free-text prompt and append them to the project. Mirrors the /api/ai/generate-block route. Returns { added, types }.",
    schema: {
      projectId: z.string(),
      prompt: z.string().describe("What should the AI build? e.g. 'a hero for a coffee shop'"),
    },
    run: toolGenerateBlocks,
  },
  {
    name: "forge_export_html",
    description:
      "Render the project's blocks + seo into a complete standalone HTML document (head meta + Tailwind CDN + body).",
    schema: { projectId: z.string() },
    run: toolExportHtml,
  },
  {
    name: "forge_create_task",
    description:
      "Enqueue an AgentTask for the project. The in-process task runner picks it up and runs the appropriate workflow. Returns { taskId, status }. Kinds: audit_seo | generate_page | optimize_meta | internal_links | publish_wp | custom.",
    schema: {
      projectId: z.string(),
      kind: z.enum([
        "audit_seo", "generate_page", "optimize_meta",
        "internal_links", "publish_wp", "custom",
      ]),
      title: z.string().optional(),
      input: z.record(z.string(), z.any()).optional().describe("Task parameters (e.g. { prompt, siteUrl, username, appPassword, status })"),
    },
    run: toolCreateTask,
  },
  {
    name: "forge_list_tasks",
    description:
      "List the 25 most recent AgentTasks for a project (id, kind, status, title, createdAt).",
    schema: { projectId: z.string() },
    run: toolListTasks,
  },
  {
    name: "forge_get_task",
    description:
      "Get a single AgentTask with full details — input, output (parsed JSON), logs, timestamps.",
    schema: { taskId: z.string() },
    run: toolGetTask,
  },
  {
    name: "forge_list_providers",
    description:
      "List the configured LLM providers (apiKey is masked). One provider is `active` and used by all LLM calls.",
    schema: {},
    run: toolListProviders,
  },
  {
    name: "forge_set_active_provider",
    description:
      "Activate a specific provider (deactivates all others). The next llmChat() call will use this provider.",
    schema: { providerId: z.string() },
    run: toolSetActiveProvider,
  },
];

// Catalog accessor — used by the dashboard's MCP tool-catalog widget.
export function listAllTools(): ToolCatalogEntry[] {
  return TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.schema,
  }));
}

// ---------------------------------------------------------------------------
// McpServer factory
// ---------------------------------------------------------------------------

const SERVER_INFO = {
  name: "forge-mcp",
  version: "1.0.0",
} as const;

/**
 * Build a fresh McpServer with all Forge tools/resources/prompts registered.
 *
 * A NEW server is returned per call so the SDK's `Protocol.connect()` guard
 * (which throws "Already connected" if the same server is reconnected) is
 * never tripped. This mirrors the official SDK stateless pattern at
 * @modelcontextprotocol/sdk examples/simpleStatelessStreamableHttp.
 */
export function buildForgeMcpServer(): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { logging: {} },
  });

  // --- Tools ---
  for (const def of TOOL_DEFS) {
    const schema = def.schema;
    const handler = def.run;
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: schema,
      },
      // The SDK validates `args` against `schema` before invoking the handler,
      // so we can safely cast to Record<string, unknown>. We try/catch so a
      // handler error becomes a structured MCP error result (per spec) instead
      // of crashing the transport.
      async (args: Record<string, unknown>) => {
        try {
          const result = await handler(args);
          return {
            content: [
              {
                type: "text" as const,
                text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true as const,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    );
  }

  // --- Resources (URI templates) ---
  // forge://project/{id}/context  → buildPageContext output (markdown)
  server.registerResource(
    "project-context",
    new ResourceTemplate("forge://project/{id}/context", { list: undefined }),
    {
      description: "Markdown page-context summary (title, meta, block list) for a Forge project.",
      mimeType: "text/markdown",
    },
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const raw = variables.id;
      const projectId = Array.isArray(raw) ? raw[0] ?? "" : raw;
      const proj = await requireProject(projectId);
      const blocks = readBlocks(proj.blocks);
      const seo = withDefaultSeo(readSeo(proj.seo));
      const markdown = buildPageContext(blocks, seo);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: markdown,
          },
        ],
      };
    },
  );

  // forge://project/{id}/blocks  → current blocks JSON
  server.registerResource(
    "project-blocks",
    new ResourceTemplate("forge://project/{id}/blocks", { list: undefined }),
    {
      description: "The project's current Block[] as JSON.",
      mimeType: "application/json",
    },
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const raw = variables.id;
      const projectId = Array.isArray(raw) ? raw[0] ?? "" : raw;
      const proj = await requireProject(projectId);
      const blocks = readBlocks(proj.blocks);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(blocks, null, 2),
          },
        ],
      };
    },
  );

  // --- Prompts ---
  // forge_page_audit: instructs the model to audit a project and produce a
  // prioritized action list. Embeds the page context so the model has the
  // current state without a separate round-trip.
  server.registerPrompt(
    "forge_page_audit",
    {
      description:
        "Audit a Forge project's SEO + content and return a prioritized action list. " +
        "Embeds the current page context so the model can act immediately.",
      argsSchema: {
        projectId: z.string().describe("The Forge project ID to audit"),
      },
    },
    async (args: Record<string, unknown>) => {
      const projectId = String(args.projectId ?? "");
      const proj = await requireProject(projectId);
      const blocks = readBlocks(proj.blocks);
      const seo = withDefaultSeo(readSeo(proj.seo));
      const ctx = buildPageContext(blocks, seo);
      const text =
        "You are an SEO + content auditor for the Forge website builder. " +
        "Below is the current page context (title, meta description, focus keyword, " +
        "and the list of blocks with their key props). Audit the page and produce a " +
        "prioritized action list (highest impact first). For each item: a short title, " +
        "why it matters, and a concrete next step (referencing Forge tools where " +
        "appropriate — e.g. `forge_add_block`, `forge_update_seo`, `forge_create_task`).\n\n" +
        `Project: ${proj.name} (${proj.id})\n\n` +
        "=== PAGE CONTEXT ===\n" +
        ctx +
        "\n=== END PAGE CONTEXT ===\n";
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      };
    },
  );

  return server;
}

// Cache the server symbol across module reloads only as a safety net — the
// route handler builds a fresh server per request. Kept for callers that
// want a long-lived handle (e.g. a future stateful mode).
let _cached: McpServer | null = null;

/**
 * Factory the route handler calls per HTTP request. Returns a fresh McpServer
 * so each request can call `await server.connect(transport)` without tripping
 * the SDK's "Already connected" guard. Tool registration is O(tools) and
 * cheap; the catalog itself is cached at module scope via TOOL_DEFS.
 */
export function getForgeMcpServer(): McpServer {
  _cached = buildForgeMcpServer();
  return _cached;
}
