// GET  /api/projects        → list all projects (summaries)
// POST /api/projects        → create a project { name, blocks?, seo?, mode? }

import { db } from "@/lib/db";
import type { Block, SeoConfig, ProjectSummary } from "@/lib/types";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

export async function GET(): Promise<Response> {
  const rows = await db.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { tasks: { select: { status: true } } },
  });
  const summaries: ProjectSummary[] = rows.map((p) => {
    const counts = { queued: 0, running: 0, done: 0, failed: 0 };
    for (const t of p.tasks) {
      if (t.status in counts) counts[t.status as keyof typeof counts]++;
    }
    let blockCount = 0;
    try {
      blockCount = (JSON.parse(p.blocks) as Block[]).length;
    } catch {
      blockCount = 0;
    }
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      mode: p.mode,
      blockCount,
      taskCounts: counts,
      updatedAt: p.updatedAt.toISOString(),
    };
  });
  return Response.json({ projects: summaries });
}

export async function POST(req: Request): Promise<Response> {
  let body: {
    name?: string;
    blocks?: Block[];
    seo?: SeoConfig;
    mode?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = (body.name ?? "Untitled Project").trim();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  // Ensure unique slug.
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let n = 1;
  while (await db.project.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  const project = await db.project.create({
    data: {
      name,
      slug,
      blocks: JSON.stringify(body.blocks ?? []),
      seo: JSON.stringify(body.seo ?? {}),
      mode: body.mode ?? "dragdrop",
    },
  });
  return Response.json({ project }, { status: 201 });
}
