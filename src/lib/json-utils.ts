// Shared JSON-recovery helpers for LLM route handlers.
//
// The z-ai-web-dev-sdk models occasionally wrap their JSON output in markdown
// fences or prefix it with a sentence like "Here are the blocks:". These
// utilities let route handlers recover the underlying JSON without resorting to
// brittle regexes that fail on nested objects/strings.

/**
 * Strip an optional fenced code block (```json ... ``` or ``` ... ```) and
 * return the inner text. Falls back to the trimmed original text if no fence
 * is present.
 */
export function stripFences(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : raw.trim();
}

/**
 * Find the first balanced JSON array (`[ ... ]`) inside `text`. Returns the
 * matched substring (including brackets) or `null` if no balanced array is
 * found. Handles nested brackets and string/escape sequences so payloads
 * containing `]` inside strings are recovered correctly.
 */
export function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Find the first balanced JSON object (`{ ... }`) inside `text`. Returns the
 * matched substring (including braces) or `null` if no balanced object is
 * found. Handles nested braces and string/escape sequences.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
