// GET    /api/tasks/[id]    → task detail (with logs)
// DELETE /api/tasks/[id]    → cancel a queued/running task

import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const t = await db.agentTask.findUnique({ where: { id } });
  if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    task: {
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
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const t = await db.agentTask.findUnique({ where: { id } });
  if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  if (t.status === "done" || t.status === "failed") {
    // already finished — just delete the row
    await db.agentTask.delete({ where: { id } });
    return Response.json({ success: true, deleted: true });
  }
  await db.agentTask.update({
    where: { id },
    data: { status: "cancelled", finishedAt: new Date() },
  });
  return Response.json({ success: true, cancelled: true });
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
