// POST /api/ai/generate-block
//
// Strict JSON generator. Given a free-text prompt and the current page
// context, returns a JSON array of block specs to ADD to the canvas. Each
// spec: { type, props, style }.

import { BLOCK_DEFINITIONS } from "@/lib/blocks";
import { extractJsonArray, stripFences } from "@/lib/json-utils";
import { llmChat } from "@/lib/llm";
import type { BlockProps, BlockStyle, BlockType } from "@/lib/types";

const VALID_TYPES: ReadonlySet<BlockType> = new Set(
  BLOCK_DEFINITIONS.map((d) => d.type),
);

interface GenerateBlockRequestBody {
  prompt?: string;
  context?: string;
}

interface BlockSpec {
  type: BlockType;
  props?: BlockProps;
  style?: BlockStyle;
}

const SYSTEM_PROMPT = `You are a strict JSON-only block generator for the Forge website builder.
Given the user's prompt and a description of the page they are editing, return a JSON ARRAY of block specifications to ADD to the canvas.

Each array element MUST be an object with this exact shape:
{
  "type": "<BlockType>",
  "props": { ... },   // properties matching the block type
  "style": { "align": "left"|"center"|"right", "background": "...", "padding": "...", "rounded": "...", "extraClass": "..." }
}

Valid block types and their relevant props:
- nav: { brand: string, links: [{label, href}] }
- hero: { badge?: string, text: string, subtitle: string, ctaText: string, ctaHref: string }
- heading: { text: string, level: 1|2|3|4|5|6 }
- paragraph: { text: string }
- button: { text: string, href: string, variant: "primary"|"secondary"|"outline"|"ghost" }
- image: { src: string (real https://images.unsplash.com/... URL), alt: string (descriptive) }
- card: { title: string, text: string }
- features: { features: [{ title: string, desc: string, icon?: string }] }
- quote: { text: string, author: string }
- cta: { text: string, ctaText: string, ctaHref: string }
- divider: {} (no props)
- spacer: {} (no props)
- footer: { brand: string, copyright: string, links: [{label, href}] }

Style guidelines:
- Use real Tailwind utility classes for background (e.g. "bg-muted", "bg-primary", "bg-card"), padding (e.g. "py-20 px-6", "p-6"), rounded (e.g. "rounded-xl", "rounded-2xl"), and extraClass (e.g. "border shadow-sm", "border-t").
- Pick align that suits the block (hero/cta usually "center", paragraphs "left").
- For images, ALWAYS use a real working Unsplash photo URL (format: https://images.unsplash.com/photo-XXXX?w=1200&q=80) and a concrete descriptive alt.

Output ONLY the JSON array. No prose, no markdown fences, no comments, no trailing commas. Do not wrap the array in an object.`;

function coerceType(value: unknown): BlockType | null {
  return typeof value === "string" && VALID_TYPES.has(value as BlockType)
    ? (value as BlockType)
    : null;
}

export async function POST(req: Request): Promise<Response> {
  let body: GenerateBlockRequestBody;
  try {
    body = (await req.json()) as GenerateBlockRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const context =
    typeof body.context === "string" ? body.context.trim() : "";

  const messages: { role: "assistant" | "user"; content: string }[] = [
    { role: "assistant", content: SYSTEM_PROMPT },
  ];

  if (context) {
    messages.push({
      role: "assistant",
      content:
        "Current page context (for reference — do not duplicate existing blocks unless asked):\n\n" +
        context,
    });
  }

  messages.push({
    role: "user",
    content: prompt,
  });

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
      { error: "Model did not return valid JSON", raw },
      { status: 502 },
    );
  }

  if (!Array.isArray(parsed)) {
    return Response.json(
      { error: "Expected a JSON array of block specs", raw },
      { status: 502 },
    );
  }

  const blocks: BlockSpec[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const type = coerceType(obj.type);
    if (!type) continue;
    blocks.push({
      type,
      props:
        obj.props && typeof obj.props === "object"
          ? (obj.props as BlockProps)
          : undefined,
      style:
        obj.style && typeof obj.style === "object"
          ? (obj.style as BlockStyle)
          : undefined,
    });
  }

  return Response.json({ blocks });
}
