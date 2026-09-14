// POST /api/n8n/webhook
//
// Receiver endpoint that n8n can call (via an HTTP Request node) to push
// events INTO Forge. n8n triggers this after running a heavy workflow on the
// VPS/laptop — e.g. "scrape competitor keywords", "run PageSpeed audit",
// "generate images" — and Forge creates an AgentTask to ingest the result.
//
// Secured with a shared secret in the `x-forge-key` header (set in n8n +
// stored in N8nConfig). If no secret is configured, the webhook is open
// during initial setup — the dashboard shows a warning.

import { db } from "@/lib/db";
import { ensureRunner } from "@/lib/task-runner";

export async function POST(req: Request): Promise<Response> {
  ensureRunner();
  const cfg = await db.n8nConfig.findUnique({ where: { id: "singleton" } });
  if (cfg?.apiKey) {
    const key = req.headers.get("x-forge-key");
    if (key !== cfg.apiKey) {
      return Response.json({ error: "Invalid webhook key" }, { status: 401 });
    }
  }

  let body: {
    event?: string;
    projectId?: string;
    taskKind?: string;
    title?: string;
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
  const project = await db.project.findUnique({ where: { id: body.projectId } });
  if (!project) return Response.json({ error: "project not found" }, { status: 404 });

  const task = await db.agentTask.create({
    data: {
      projectId: body.projectId,
      kind: body.taskKind ?? "custom",
      title: body.title ?? `n8n: ${body.event ?? "webhook"}`,
      priority: 8, // n8n-triggered tasks get a slight priority boost
      input: JSON.stringify(body.input ?? { event: body.event }),
    },
  });
  return Response.json({ received: true, taskId: task.id }, { status: 201 });
}
