// GET  /api/n8n   → get n8n config + connection test
// PUT  /api/n8n   → update n8n config
// POST /api/n8n/trigger  (separate file) → trigger an n8n workflow

import { db } from "@/lib/db";

export async function GET(): Promise<Response> {
  const cfg = await db.n8nConfig.findUnique({ where: { id: "singleton" } });
  return Response.json({
    baseUrl: cfg?.baseUrl ?? null,
    apiKey: cfg?.apiKey ? "•••••" : null,
    enabled: cfg?.enabled ?? false,
    hasKey: !!cfg?.apiKey,
  });
}

export async function PUT(req: Request): Promise<Response> {
  let body: {
    baseUrl?: string;
    apiKey?: string;
    enabled?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const data: { baseUrl?: string; apiKey?: string; enabled?: boolean } = {};
  if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl || null;
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.apiKey && !body.apiKey.startsWith("•")) data.apiKey = body.apiKey;

  const cfg = await db.n8nConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  return Response.json({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey ? "•••••" : null,
    enabled: cfg.enabled,
    hasKey: !!cfg.apiKey,
  });
}
