// GET    /api/projects/[id]   → full project (blocks + seo + customCode + mode)
// PUT    /api/projects/[id]   → update project (sync from browser / agent)
// DELETE /api/projects/[id]   → delete project

import { db } from "@/lib/db";
import type { Block, SeoConfig } from "@/lib/types";

interface FullProject {
  id: string;
  name: string;
  slug: string;
  mode: string;
  blocks: Block[];
  seo: SeoConfig;
  customCode: string;
  updatedAt: string;
  createdAt: string;
}

function serialize(p: {
  id: string;
  name: string;
  slug: string;
  mode: string;
  blocks: string;
  seo: string;
  customCode: string;
  updatedAt: Date;
  createdAt: Date;
}): FullProject {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    mode: p.mode,
    blocks: safeParse(p.blocks, []) as Block[],
    seo: safeParse(p.seo, {}) as SeoConfig,
    customCode: p.customCode,
    updatedAt: p.updatedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id } });
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ project: serialize(p) });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: {
    name?: string;
    blocks?: Block[];
    seo?: SeoConfig;
    mode?: string;
    customCode?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.blocks !== undefined) data.blocks = JSON.stringify(body.blocks);
  if (body.seo !== undefined) data.seo = JSON.stringify(body.seo);
  if (body.mode !== undefined) data.mode = body.mode;
  if (body.customCode !== undefined) data.customCode = body.customCode;

  const updated = await db.project.update({ where: { id }, data });
  return Response.json({ project: serialize(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    await db.project.delete({ where: { id } });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
