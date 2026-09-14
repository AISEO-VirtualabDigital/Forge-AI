// PATCH /api/providers/[id]  → update a provider
// DELETE /api/providers/[id]  → delete a provider

import { db } from "@/lib/db";
import { invalidateProvider } from "@/lib/providers";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
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
  if (body.active) {
    await db.providerConfig.updateMany({ where: { active: true }, data: { active: false } });
  }
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.type !== undefined) data.type = body.type;
  if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl;
  if (body.model !== undefined) data.model = body.model;
  if (body.active !== undefined) data.active = body.active;
  // Only overwrite apiKey if a non-empty value is provided (so the masked
  // "•••••" placeholder from the UI never clobbers the real secret).
  if (body.apiKey && !body.apiKey.startsWith("•")) data.apiKey = body.apiKey;

  const updated = await db.providerConfig.update({ where: { id }, data });
  invalidateProvider();
  return Response.json({ provider: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  await db.providerConfig.delete({ where: { id } });
  invalidateProvider();
  return Response.json({ success: true });
}
