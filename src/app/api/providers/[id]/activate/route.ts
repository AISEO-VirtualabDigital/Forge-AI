// POST /api/providers/[id]/activate  → set a provider as the active one

import { db } from "@/lib/db";
import { invalidateProvider } from "@/lib/providers";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const exists = await db.providerConfig.findUnique({ where: { id } });
  if (!exists) return Response.json({ error: "Not found" }, { status: 404 });
  await db.providerConfig.updateMany({ where: { active: true }, data: { active: false } });
  const updated = await db.providerConfig.update({ where: { id }, data: { active: true } });
  invalidateProvider();
  return Response.json({ provider: updated });
}
