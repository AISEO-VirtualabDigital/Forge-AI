// POST /api/ai/chat
//
// Powers the floating "Forge AI" assistant bubble. Returns the assistant's
// reply text. The reply may contain an optional ```forge-action fenced JSON
// block at the very end that the client parses to mutate the canvas
// (add_blocks / update_seo).

import { llmChat } from "@/lib/llm";

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages?: IncomingMessage[];
  context?: string;
}

const SYSTEM_PROMPT = `You are "Forge AI", an expert web designer & SEO co-pilot embedded inside a visual website builder called Forge.
You help the user design better pages, write sharper copy, structure sections, and improve on-page SEO.
Be concise, friendly and pragmatic. Use markdown (headings, bullet points, bold) when it genuinely helps.
You can suggest blocks/sections, draft copy, critique layout, and advise on SEO. When proposing concrete changes, prefer specific, copy-paste-ready text over vague advice.

When you want to MUTATE THE CANVAS, append exactly ONE fenced code block tagged \`\`\`forge-action at the very end of your message, containing a single JSON object of one of these shapes:
{ "kind": "add_blocks", "blocks": [ { "type": "hero", "props": {...}, "style": {...} }, ... ] }
{ "kind": "update_seo", "seo": { "title": "...", "description": "...", "focusKeyword": "...", "keywords": "...", "ogTitle": "...", "ogDescription": "...", "jsonLd": "..." } }

Rules for the action block:
- Valid block types: nav, hero, heading, paragraph, button, image, card, features, quote, cta, divider, spacer, footer.
- For each block, "props" must match the block type (e.g. hero uses badge, text, subtitle, ctaText, ctaHref).
- "style" may use align ("left"|"center"|"right"), background, padding, rounded, extraClass with real Tailwind classes.
- Only emit ONE action block per message, at the very end. Do not put prose after it.
- If you are NOT mutating the canvas, do not emit any forge-action block at all.
- Never wrap the action JSON in another language or commentary — just the fenced block.`;

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  if (history.length === 0) {
    return Response.json(
      { error: "messages[] is required" },
      { status: 400 },
    );
  }

  // Build the message list. The system primer is sent with role "assistant"
  // per the project LLM usage contract, followed by the optional page-context
  // note, then the user-supplied history verbatim.
  const messages: { role: "assistant" | "user"; content: string }[] = [
    { role: "assistant", content: SYSTEM_PROMPT },
  ];

  if (typeof body.context === "string" && body.context.trim()) {
    messages.push({
      role: "assistant",
      content:
        "Here is a snapshot of the page the user is currently editing — refer to it when relevant:\n\n" +
        body.context,
    });
  }

  for (const m of history) {
    if (
      m &&
      typeof m.content === "string" &&
      (m.role === "user" || m.role === "assistant")
    ) {
      messages.push({ role: m.role, content: m.content });
    }
  }

  try {
    const reply = await llmChat(messages);
    return Response.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown LLM error";
    return Response.json({ error: message }, { status: 500 });
  }
}
