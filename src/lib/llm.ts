// LLM helper — now a thin shim over the pluggable provider abstraction.
//
// All server-side LLM calls should go through `llmChat` here so they respect
// the active provider configured in the dashboard (z-ai cloud, Ollama on the
// laptop, opencode CLI, etc.). The original z-ai-only helpers are kept for
// backward compatibility with code that imports getZai directly.

import ZAI from "z-ai-web-dev-sdk";
import { llmChat as providerChat } from "@/lib/providers";

export type { ChatMessage } from "@/lib/providers";

type ZaiInstance = Awaited<ReturnType<typeof ZAI.create>>;

let cached: ZaiInstance | null = null;
let pending: Promise<ZaiInstance> | null = null;

/**
 * Lazily create and cache the ZAI client (z-ai cloud SDK). Kept for callers
 * that need the raw SDK instance.
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
 * The canonical chat helper. Delegates to the active provider — so if the
 * dashboard has activated an Ollama endpoint on the laptop, this call lands
 * there instead of the z-ai cloud.
 */
export async function llmChat(
  messages: { role: "assistant" | "user"; content: string }[],
): Promise<string> {
  return providerChat(messages);
}
