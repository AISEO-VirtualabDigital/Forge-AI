// GET  /api/tasks?projectId=...   → list tasks for a project
// POST /api/tasks                 → create a task { projectId, kind, input?, title? }

import { db } from "@/lib/db";
import { ensureRunner } from "@/lib/task-runner";
import type { TaskKind } from "@/lib/types";

const VALID_KINDS: TaskKind[] = [
  "audit_seo",
  "generate_page",
  "optimize_meta",
  "internal_links",
  "publish_wp",
  "custom",
];

export async function GET(req: Request): Promise<Response> {
  ensureRunner();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const tasks = await db.agentTask.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      kind: t.kind,
      status: t.status,
      priority: t.priority,
      title: t.title,
      input: safeParse(t.input, {}),
      output: safeParse(t.output, {}),
      logs: t.logs,
      startedAt: t.startedAt?.toISOString() ?? null,
      finishedAt: t.finishedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request): Promise<Response> {
  ensureRunner();
  let body: {
    projectId?: string;
    kind?: string;
    title?: string;
    priority?: number;
    input?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.projectId) {
    return Response.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!body.kind || !VALID_KINDS.includes(body.kind as TaskKind)) {
    return Response.json(
      { error: `kind must be one of: ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );
  }
  const project = await db.project.findUnique({ where: { id: body.projectId } });
  if (!project) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }
  const task = await db.agentTask.create({
    data: {
      projectId: body.projectId,
      kind: body.kind,
      title: body.title || body.kind,
      priority: body.priority ?? 5,
      input: JSON.stringify(body.input ?? {}),
    },
  });
  return Response.json({ task }, { status: 201 });
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
