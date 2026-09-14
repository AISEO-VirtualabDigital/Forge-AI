// POST /api/n8n/trigger
//
// Triggers an n8n workflow by its ID. This is the "Forge → n8n" direction:
// the Forge agent (or a user clicking the dashboard) asks n8n to run a heavy
// workflow (PageSpeed audit, keyword research, image generation, etc.) on the
// VPS. n8n does the heavy lifting, then calls back /api/n8n/webhook with
// results.

import { db } from "@/lib/db";

export async function POST(req: Request): Promise<Response> {
  let body: { workflowId?: string; data?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const cfg = await db.n8nConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg?.baseUrl) {
    return Response.json({ error: "n8n is not configured" }, { status: 400 });
  }
  if (!body.workflowId) {
    return Response.json({ error: "workflowId is required" }, { status: 400 });
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/api/v1/workflows/${body.workflowId}/execute`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { "X-N8N-API-KEY": cfg.apiKey } : {}),
      },
      body: JSON.stringify({ data: body.data ?? {} }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json(
        { error: `n8n returned ${res.status}`, detail: text.slice(0, 300) },
        { status: 502 },
      );
    }
    const data = await res.json().catch(() => ({}));
    return Response.json({ triggered: true, response: data });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Network error" },
      { status: 504 },
    );
  }
}
