// POST /api/ai/seo-suggest
//
// Asks the model to act as an SEO consultant and return a single JSON object
// with optimized title, description, focus keyword, keywords, OG tags,
// JSON-LD and a short list of actionable tips. If the model fails to return
// parseable JSON, we surface the raw text under { raw } with a 200 so the
// client can degrade gracefully.

import { extractJsonObject, stripFences } from "@/lib/json-utils";
import { llmChat } from "@/lib/llm";
import type { SeoConfig } from "@/lib/types";

interface SeoSuggestRequestBody {
  seo?: SeoConfig;
  contentText?: string;
}

interface SeoSuggestion {
  title: string;
  description: string;
  focusKeyword: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  jsonLd: string;
  tips: string[];
}

const SYSTEM_PROMPT = `You are an expert SEO consultant for the Forge website builder.
Given the current SEO configuration and the page's text content, produce an OPTIMIZED SEO recommendation.

Return ONLY a single JSON object with EXACTLY these keys (no extra keys, no prose outside the JSON):
{
  "title": string,            // <= 60 characters, include focus keyword near the front
  "description": string,       // 70-160 characters, compelling, includes focus keyword naturally
  "focusKeyword": string,     // a single primary keyword phrase (lowercase preferred)
  "keywords": string,          // comma-separated list of 5-10 related keywords
  "ogTitle": string,          // Open Graph title (can mirror the title or be punchier)
  "ogDescription": string,    // Open Graph description (concise social-friendly version)
  "jsonLd": string,            // a COMPACT JSON-LD string (single line or pretty, valid JSON) for WebSite or Organization
  "tips": string[]             // 3-5 short, actionable improvement strings
}

Hard rules:
- Output ONLY the JSON object. No prose, no markdown fences, no comments.
- Do NOT wrap the JSON in another object.
- All string values must be properly escaped JSON strings.
- The "tips" array must contain between 3 and 5 items, each a short string.`;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export async function POST(req: Request): Promise<Response> {
  let body: SeoSuggestRequestBody;
  try {
    body = (await req.json()) as SeoSuggestRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const seo = body.seo;
  const contentText =
    typeof body.contentText === "string" ? body.contentText.trim() : "";

  if (!seo || typeof seo !== "object") {
    return Response.json({ error: "seo is required" }, { status: 400 });
  }

  const messages: { role: "assistant" | "user"; content: string }[] = [
    { role: "assistant", content: SYSTEM_PROMPT },
  ];

  messages.push({
    role: "assistant",
    content:
      "Current SEO configuration:\n" +
      JSON.stringify(
        {
          title: seo.title,
          description: seo.description,
          keywords: seo.keywords,
          focusKeyword: seo.focusKeyword,
          canonical: seo.canonical,
          ogTitle: seo.ogTitle,
          ogDescription: seo.ogDescription,
          author: seo.author,
          lang: seo.lang,
        },
        null,
        2,
      ),
  });

  if (contentText) {
    messages.push({
      role: "assistant",
      content:
        "Page content (extracted text):\n" +
        (contentText.length > 4000 ? contentText.slice(0, 4000) + "…" : contentText),
    });
  }

  messages.push({
    role: "user",
    content:
      "Produce the optimized SEO JSON object now. Remember: ONLY the JSON object, no prose.",
  });

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
  const tips = isStringArray(obj.tips) ? obj.tips.slice(0, 5) : [];

  const suggestion: SeoSuggestion = {
    title: typeof obj.title === "string" ? obj.title : "",
    description: typeof obj.description === "string" ? obj.description : "",
    focusKeyword:
      typeof obj.focusKeyword === "string" ? obj.focusKeyword : "",
    keywords: typeof obj.keywords === "string" ? obj.keywords : "",
    ogTitle: typeof obj.ogTitle === "string" ? obj.ogTitle : "",
    ogDescription:
      typeof obj.ogDescription === "string" ? obj.ogDescription : "",
    jsonLd: typeof obj.jsonLd === "string" ? obj.jsonLd : "",
    tips,
  };

  return Response.json(suggestion);
}
