// Shared, lazily-cached singleton for the z-ai-web-dev-sdk.
//
// The SDK MUST only be used in server code (route handlers / server actions),
// never on the client. Importing this module from client code would pull the
// SDK into the browser bundle, so keep every consumer on the server.

import ZAI from "z-ai-web-dev-sdk";

type ZaiInstance = Awaited<ReturnType<typeof ZAI.create>>;

let cached: ZaiInstance | null = null;
let pending: Promise<ZaiInstance> | null = null;

/**
 * Lazily create and cache the ZAI client. Concurrent callers share the same
 * in-flight promise so we never construct two clients at the same time.
 */
export async function getZai(): Promise<ZaiInstance> {
  if (cached) return cached;
  if (pending) return pending;
  pending = ZAI.create().finally(() => {
    pending = null;
  });
  cached = await pending;
  return cached;
}

/**
 * Thin helper around `zai.chat.completions.create` that:
 *  - prepends a system/assistant primer message,
 *  - forwards the supplied `messages` (already in the role/content shape the
 *    SDK expects),
 *  - disables the "thinking" mode for fast, cheap, deterministic replies,
 *  - returns the raw text of the first choice (empty string on failure).
 *
 * Callers are expected to wrap this in their own try/catch so they can return
 * an appropriate HTTP error response.
 */
export async function llmChat(
  messages: { role: "assistant" | "user"; content: string }[],
): Promise<string> {
  const zai = await getZai();
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
  });
  return completion?.choices?.[0]?.message?.content ?? "";
}
