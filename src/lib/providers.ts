// Pluggable LLM provider abstraction.
//
// Lets Forge route LLM calls to whichever provider is "active" in the DB:
//   - zai          : the z-ai-web-dev-sdk (default cloud model)
//   - openai_compat: any OpenAI-compatible endpoint — Ollama (laptop),
//                    LM Studio, vLLM, OpenRouter, etc. → free local models
//   - opencode     : delegate to the local `opencode` CLI agent for code-heavy
//                    subtasks (runs on the 16GB laptop)
//
// This is the "free models" integration: point openai_compat at
// http://<laptop-ip>:11434/v1 with model llama3.1:8b and all the existing
// /api/ai/* routes now run on a local model — no cloud tokens consumed.

import { db } from "@/lib/db";
import type { ProviderConfig, ProviderType } from "@/lib/types";

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

export interface LlmProvider {
  type: ProviderType;
  chat(messages: ChatMessage[]): Promise<string>;
}

// -------------------------------------------------------------------------
// z-ai provider (cloud)
// -------------------------------------------------------------------------

class ZaiProvider implements LlmProvider {
  type: ProviderType = "zai";
  private cached: unknown = null;
  private pending: Promise<unknown> | null = null;

  private async getClient() {
    if (this.cached) return this.cached;
    if (this.pending) return this.pending;
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    this.pending = ZAI.create().finally(() => {
      this.pending = null;
    });
    this.cached = await this.pending;
    return this.cached;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const zai = (await this.getClient()) as {
      chat: {
        completions: {
          create: (args: {
            messages: { role: string; content: string }[];
            thinking: { type: string };
          }) => Promise<{
            choices?: { message?: { content?: string } }[];
          }>;
        };
      };
    };
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });
    return completion?.choices?.[0]?.message?.content ?? "";
  }
}

// -------------------------------------------------------------------------
// OpenAI-compatible provider (Ollama / LM Studio / vLLM / OpenRouter)
// -------------------------------------------------------------------------

class OpenAiCompatProvider implements LlmProvider {
  type: ProviderType = "openai_compat";
  constructor(
    private baseUrl: string,
    private apiKey: string | null,
    private model: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenAI-compatible provider error ${res.status}: ${text.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data?.choices?.[0]?.message?.content ?? "";
  }
}

// -------------------------------------------------------------------------
// opencode CLI provider — delegates to the local opencode agent
// -------------------------------------------------------------------------

class OpenCodeProvider implements LlmProvider {
  type: ProviderType = "opencode";
  constructor(
    private model: string,
    private workingDir?: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    // opencode is a TUI/coding agent; we invoke it non-interactively.
    // `opencode run "<prompt>"` returns the agent's final message on stdout.
    // We flatten the message history into a single prompt for the CLI.
    const prompt = messages
      .map((m) =>
        m.role === "assistant" ? `[system]\n${m.content}` : `[user]\n${m.content}`,
      )
      .join("\n\n");

    const proc = Bun.spawn(["opencode", "run", "--model", this.model, prompt], {
      cwd: this.workingDir ?? process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`opencode exited ${code}: ${stderr.slice(0, 300)}`);
    }
    return stdout.trim();
  }
}

// -------------------------------------------------------------------------
// Provider registry — resolves the active provider from the DB
// -------------------------------------------------------------------------

let activeProvider: LlmProvider | null = null;
let activeProviderId: string | null = null;

async function loadActiveProvider(): Promise<LlmProvider> {
  // Look up the active provider row.
  let cfg = await db.providerConfig.findFirst({
    where: { active: true },
  });
  // If none is active, fall back to zai (default cloud).
  if (!cfg) {
    return new ZaiProvider();
  }

  // If the active provider changed since last load, rebuild it.
  if (activeProvider && activeProviderId === cfg.id) {
    return activeProvider;
  }

  let provider: LlmProvider;
  switch (cfg.type) {
    case "openai_compat":
      if (!cfg.baseUrl || !cfg.model) {
        // misconfigured — fall back to zai
        return new ZaiProvider();
      }
      provider = new OpenAiCompatProvider(cfg.baseUrl, cfg.apiKey ?? null, cfg.model);
      break;
    case "opencode":
      provider = new OpenCodeProvider(cfg.model ?? "default");
      break;
    case "zai":
    default:
      provider = new ZaiProvider();
      break;
  }
  activeProvider = provider;
  activeProviderId = cfg.id;
  return provider;
}

/**
 * Invalidate the cached provider so the next call picks up config changes
 * from the DB. Called after provider settings are updated.
 */
export function invalidateProvider(): void {
  activeProvider = null;
  activeProviderId = null;
}

/**
 * The single entry point for all server-side LLM calls. Routes to the active
 * provider. Falls back to z-ai if the active provider is misconfigured or
 * throws (so the app never hard-fails).
 */
export async function llmChat(messages: ChatMessage[]): Promise<string> {
  try {
    const provider = await loadActiveProvider();
    return await provider.chat(messages);
  } catch (err) {
    // Degrade gracefully to the z-ai cloud provider.
    const fallback = new ZaiProvider();
    const result = await fallback.chat(messages).catch(() => "");
    if (!result) {
      throw err;
    }
    return result;
  }
}

/**
 * Health-check a provider config without activating it. Used by the
 * "Test provider" button in the dashboard.
 */
export async function testProvider(
  cfg: Pick<ProviderConfig, "type" | "baseUrl" | "apiKey" | "model">,
): Promise<{ ok: boolean; detail: string }> {
  try {
    let provider: LlmProvider;
    switch (cfg.type) {
      case "openai_compat":
        if (!cfg.baseUrl || !cfg.model) {
          return { ok: false, detail: "baseUrl and model are required" };
        }
        provider = new OpenAiCompatProvider(cfg.baseUrl, cfg.apiKey ?? null, cfg.model);
        break;
      case "opencode":
        provider = new OpenCodeProvider(cfg.model ?? "default");
        break;
      case "zai":
      default:
        provider = new ZaiProvider();
        break;
    }
    const reply = await provider.chat([
      { role: "assistant", content: "You are a connectivity test. Reply OK." },
      { role: "user", content: "ping" },
    ]);
    return {
      ok: true,
      detail: `Replied: ${reply.slice(0, 80) || "(empty)"}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
