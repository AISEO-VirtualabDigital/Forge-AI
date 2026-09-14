// POST /api/ai/eeat
//
// Asks the model to produce a natural-language E-E-A-T narrative (Google's
// Experience, Expertise, Authoritativeness, Trustworthiness framework) given
// page signals + content. The browser sends the page's extracted text, the
// SEO config, and a signals object produced by `analyzeEeat`. We return the
// parsed JSON object on success, or fall back to `{ raw }` (HTTP 200) so the
// UI can degrade gracefully — same pattern as `/api/ai/seo-suggest`.

import { extractJsonObject, stripFences } from "@/lib/json-utils";
import { llmChat } from "@/lib/llm";
import type { SeoConfig } from "@/lib/types";

interface EeatSignals {
  hasAuthorBio?: boolean;
  hasContactInfo?: boolean;
  hasAboutMention?: boolean;
  hasFirstPerson?: boolean;
  hasCitations?: boolean;
  hasHttps?: boolean;
  hasSchema?: boolean;
  hasDates?: boolean;
  hasDisclaimers?: boolean;
  hasExternalLinks?: boolean;
  firstPersonCount?: number;
  citationCount?: number;
  contentDepthScore?: number;
}

interface EeatRequestBody {
  contentText?: string;
  seo?: SeoConfig;
  signals?: EeatSignals;
}

interface EeatNarrative {
  narrative: string;
  strengths: string[];
  improvements: string[];
  priorityAction: string;
}

const SYSTEM_PROMPT = `You are an SEO expert specializing in Google's E-E-A-T framework (Experience, Expertise, Authoritativeness, Trustworthiness). Given page signals and content, return a JSON object: { narrative: string (2-3 sentence summary of the page's E-E-A-T standing), strengths: string[] (2-4 items), improvements: string[] (4-6 concrete, specific, prioritized actions), priorityAction: string (the single highest-impact next step) }. Be specific and actionable. Output ONLY the JSON — no prose, no fences.`;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export async function POST(req: Request): Promise<Response> {
  let body: EeatRequestBody;
  try {
    body = (await req.json()) as EeatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contentText =
    typeof body.contentText === "string" ? body.contentText.trim() : "";
  const seo = body.seo;
  const signals = body.signals && typeof body.signals === "object" ? body.signals : {};

  if (!contentText) {
    return Response.json(
      { error: "contentText is required" },
      { status: 400 },
    );
  }

  const title = seo && typeof seo.title === "string" ? seo.title : "";
  const canonical =
    seo && typeof seo.canonical === "string" ? seo.canonical : "";
  const author = seo && typeof seo.author === "string" ? seo.author : "";

  const signalsBlock = JSON.stringify(
    {
      hasAuthorBio: Boolean(signals.hasAuthorBio),
      hasContactInfo: Boolean(signals.hasContactInfo),
      hasAboutMention: Boolean(signals.hasAboutMention),
      hasFirstPerson: Boolean(signals.hasFirstPerson),
      hasCitations: Boolean(signals.hasCitations),
      hasHttps: Boolean(signals.hasHttps),
      hasSchema: Boolean(signals.hasSchema),
      hasDates: Boolean(signals.hasDates),
      hasDisclaimers: Boolean(signals.hasDisclaimers),
      hasExternalLinks: Boolean(signals.hasExternalLinks),
      firstPersonCount:
        typeof signals.firstPersonCount === "number"
          ? signals.firstPersonCount
          : 0,
      citationCount:
        typeof signals.citationCount === "number"
          ? signals.citationCount
          : 0,
      contentDepthScore:
        typeof signals.contentDepthScore === "number"
          ? signals.contentDepthScore
          : 0,
    },
    null,
    2,
  );

  const trimmedContent =
    contentText.length > 3000 ? contentText.slice(0, 3000) + "…" : contentText;

  const userMessage =
    `Page metadata:\n` +
    `- title: ${title || "(none)"}\n` +
    `- canonical: ${canonical || "(none)"}\n` +
    `- author: ${author || "(none)"}\n\n` +
    `Detected E-E-A-T signals:\n${signalsBlock}\n\n` +
    `Page content text:\n${trimmedContent}\n\n` +
    `Return the E-E-A-T JSON object now. ONLY the JSON object, no prose.`;

  const messages: { role: "assistant" | "user"; content: string }[] = [
    { role: "assistant", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let raw: string;
  try {
    raw = await llmChat(messages);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown LLM error";
    return Response.json({ error: message }, { status: 500 });
  }

  const cleaned = stripFences(raw);
  const objectText = extractJsonObject(cleaned) ?? cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(objectText);
  } catch {
    // Graceful degradation: hand the raw text back so the UI can show it.
    return Response.json({ raw });
  }

  if (!parsed || typeof parsed !== "object") {
    return Response.json({ raw });
  }

  const obj = parsed as Record<string, unknown>;
  const narrative: EeatNarrative = {
    narrative: typeof obj.narrative === "string" ? obj.narrative : "",
    strengths: isStringArray(obj.strengths) ? obj.strengths.slice(0, 4) : [],
    improvements: isStringArray(obj.improvements)
      ? obj.improvements.slice(0, 6)
      : [],
    priorityAction:
      typeof obj.priorityAction === "string" ? obj.priorityAction : "",
  };

  return Response.json(narrative);
}
