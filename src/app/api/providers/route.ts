// GET  /api/providers   → list all providers
// POST /api/providers   → create a provider
// PATCH handled at /api/providers/[id]

import { db } from "@/lib/db";
import { invalidateProvider } from "@/lib/providers";

export async function GET(): Promise<Response> {
  const rows = await db.providerConfig.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json({
    providers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      baseUrl: r.baseUrl,
      model: r.model,
      apiKey: r.apiKey ? "•••••" : null,
      active: r.active,
      healthy: r.healthy,
      lastCheck: r.lastCheck?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: {
    name?: string;
    type?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    active?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.name || !body.type) {
    return Response.json({ error: "name and type are required" }, { status: 400 });
  }
  // If active, deactivate others.
  if (body.active) {
    await db.providerConfig.updateMany({ where: { active: true }, data: { active: false } });
  }
  const provider = await db.providerConfig.create({
    data: {
      name: body.name,
      type: body.type,
      baseUrl: body.baseUrl ?? null,
      apiKey: body.apiKey ?? null,
      model: body.model ?? null,
      active: body.active ?? false,
    },
  });
  invalidateProvider();
  return Response.json({ provider }, { status: 201 });
}
