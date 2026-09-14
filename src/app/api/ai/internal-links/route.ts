// POST /api/ai/internal-links
//
// Asks the model to act as an SEO internal-linking specialist and return a
// JSON array of internal-link suggestions for the current page. The browser
// sends the page content text, the canvas blocks (for context) and the SEO
// config (title, focus keyword, canonical). We return the validated list
// with stable ids `il_<index>`.

import { extractJsonArray, stripFences } from "@/lib/json-utils";
import { llmChat } from "@/lib/llm";
import type { Block, InternalLinkSuggestion, SeoConfig } from "@/lib/types";

interface InternalLinksRequestBody {
  contentText?: string;
  blocks?: Block[];
  seo?: SeoConfig;
}

interface RawSuggestion {
  anchorText?: unknown;
  suggestedTarget?: unknown;
  reason?: unknown;
  blockId?: unknown;
}

const SYSTEM_PROMPT = `You are an SEO internal-linking specialist. Given the page content (text) and metadata, return a JSON array of internal-link suggestions. Each suggestion: { anchorText: string (exact substring from the content, 2-6 words), suggestedTarget: string (a sensible URL using the page's canonical domain, e.g. https://example.com/blog/related-topic, or an in-page #anchor), reason: string (short why). Aim for 5-8 suggestions. Prefer linking to related topical pages, category pages, or anchor sections. Output ONLY the JSON array — no prose, no fences.`;

export async function POST(req: Request): Promise<Response> {
  let body: InternalLinksRequestBody;
  try {
    body = (await req.json()) as InternalLinksRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contentText =
    typeof body.contentText === "string" ? body.contentText.trim() : "";
  const seo = body.seo;
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];

  if (!contentText) {
    return Response.json(
      { error: "contentText is required" },
      { status: 400 },
    );
  }

  // Build the user message: a compact metadata block + truncated content.
  const title = seo && typeof seo.title === "string" ? seo.title : "";
  const focusKeyword =
    seo && typeof seo.focusKeyword === "string" ? seo.focusKeyword : "";
  const canonical =
    seo && typeof seo.canonical === "string" ? seo.canonical : "";

  const blockSummary = blocks
    .map((b) => `${b.type}:${b.id}`)
    .slice(0, 40)
    .join(", ");

  const trimmedContent =
    contentText.length > 3000
      ? contentText.slice(0, 3000) + "…"
      : contentText;

  const userMessage =
    `Page metadata:\n` +
    `- title: ${title || "(none)"}\n` +
    `- focusKeyword: ${focusKeyword || "(none)"}\n` +
    `- canonical: ${canonical || "(none)"}\n` +
    `- blocks: ${blockSummary || "(none)"}\n\n` +
    `Page content text:\n${trimmedContent}\n\n` +
    `Return the JSON array of internal-link suggestions now. ONLY the JSON array.`;

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
  const arrayText = extractJsonArray(cleaned) ?? cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch {
    return Response.json(
      { error: "Model did not return valid JSON array", raw },
      { status: 502 },
    );
  }

  if (!Array.isArray(parsed)) {
    return Response.json(
      { error: "Expected a JSON array of link suggestions", raw },
      { status: 502 },
    );
  }

  const suggestions: InternalLinkSuggestion[] = [];
  parsed.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const rawItem = item as RawSuggestion;
    const anchorText =
      typeof rawItem.anchorText === "string"
        ? rawItem.anchorText.trim()
        : "";
    const suggestedTarget =
      typeof rawItem.suggestedTarget === "string"
        ? rawItem.suggestedTarget.trim()
        : "";
    if (!anchorText || !suggestedTarget) return;
    const reason =
      typeof rawItem.reason === "string" ? rawItem.reason.trim() : "";
    const blockId =
      typeof rawItem.blockId === "string" ? rawItem.blockId : undefined;
    suggestions.push({
      id: `il_${index}`,
      anchorText,
      suggestedTarget,
      reason,
      blockId,
      applied: false,
    });
  });

  return Response.json({ suggestions });
}
