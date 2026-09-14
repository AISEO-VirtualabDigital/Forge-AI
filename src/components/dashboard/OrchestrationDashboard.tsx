"use client";

import * as React from "react";
import {
  Activity,
  Boxes,
  Cpu,
  Plug,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Play,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useBuilder } from "@/lib/store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------- types ----------
interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  mode: string;
  blockCount: number;
  taskCounts: { queued: number; running: number; done: number; failed: number };
  updatedAt: string;
}
interface TaskRow {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  priority: number;
  title: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  logs: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}
interface ProviderRow {
  id: string;
  name: string;
  type: string;
  baseUrl?: string | null;
  model?: string | null;
  apiKey?: string | null;
  active: boolean;
  healthy: boolean;
  lastCheck?: string | null;
}
interface N8nState {
  baseUrl?: string | null;
  apiKey?: string | null;
  enabled: boolean;
  hasKey: boolean;
}

const TASK_KINDS: { value: string; label: string; desc: string }[] = [
  { value: "audit_seo", label: "SEO + EEAT Audit", desc: "Run full SEO & E-E-A-T analysis + AI internal-link suggestions" },
  { value: "generate_page", label: "Generate Page (AI)", desc: "AI generates blocks from a text prompt" },
  { value: "optimize_meta", label: "Optimize Meta (AI)", desc: "AI rewrites title/description/keywords/JSON-LD" },
  { value: "internal_links", label: "Internal Links (AI)", desc: "AI finds internal-link opportunities" },
  { value: "publish_wp", label: "Publish to WordPress", desc: "Push the page to a WordPress site" },
  { value: "custom", label: "Custom Agent Task", desc: "Free-form prompt to the active provider" },
];

const STATUS_META: Record<
  string,
  { color: string; icon: React.ElementType; label: string }
> = {
  queued: { color: "text-muted-foreground bg-muted", icon: Clock, label: "Queued" },
  running: { color: "text-blue-500 bg-blue-500/10", icon: Loader2, label: "Running" },
  done: { color: "text-emerald-500 bg-emerald-500/10", icon: CheckCircle2, label: "Done" },
  failed: { color: "text-red-500 bg-red-500/10", icon: XCircle, label: "Failed" },
  cancelled: { color: "text-muted-foreground bg-muted", icon: Ban, label: "Cancelled" },
};

// ---------- main dashboard ----------
export function OrchestrationDashboard() {
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [n8n, setN8n] = React.useState<N8nState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [spawnOpen, setSpawnOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"tasks" | "providers" | "n8n">("tasks");

  const serverProjectId = useBuilder((s) => s.serverProjectId);
  const setServerProjectId = useBuilder((s) => s.setServerProjectId);
  const setActiveView = useBuilder((s) => s.setActiveView);

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      /* ignore */
    }
  }

  async function loadTasks() {
    if (!selectedProjectId) {
      setTasks([]);
      return;
    }
    try {
      const res = await fetch(`/api/tasks?projectId=${selectedProjectId}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {
      /* ignore */
    }
  }

  async function loadProviders() {
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch {
      /* ignore */
    }
  }

  async function loadN8n() {
    try {
      const res = await fetch("/api/n8n");
      const data = await res.json();
      setN8n(data);
    } catch {
      /* ignore */
    }
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadProjects(), loadProviders(), loadN8n()]);
    setLoading(false);
  }

  React.useEffect(() => {
    void loadAll();
  }, []);

  // Auto-select the project tied to the builder if any.
  React.useEffect(() => {
    if (serverProjectId && !selectedProjectId) {
      setSelectedProjectId(serverProjectId);
    }
  }, [serverProjectId, selectedProjectId]);

  // Poll tasks every 2s when on the tasks tab.
  React.useEffect(() => {
    if (activeTab !== "tasks" || !selectedProjectId) return;
    void loadTasks();
    const t = setInterval(loadTasks, 2000);
    return () => clearInterval(t);
  }, [activeTab, selectedProjectId]);

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const queuedCount = tasks.filter((t) => t.status === "queued").length;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/20">
      {/* Left: projects list */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Boxes className="h-4 w-4" /> Projects
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={loadAll}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {projects.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No projects yet. Create one from the Builder (Save to Server).
              </p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setActiveTab("tasks");
                  }}
                  className={cn(
                    "block w-full rounded-md border p-2 text-left transition-colors hover:bg-accent",
                    selectedProjectId === p.id && "border-primary bg-accent",
                  )}
                >
                  <p className="truncate text-xs font-medium">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.blockCount} blocks · {p.mode}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.taskCounts.running > 0 && (
                      <Badge className="bg-blue-500/10 px-1 text-[9px] text-blue-500">
                        {p.taskCounts.running} running
                      </Badge>
                    )}
                    {p.taskCounts.queued > 0 && (
                      <Badge variant="outline" className="px-1 text-[9px]">
                        {p.taskCounts.queued} queued
                      </Badge>
                    )}
                    {p.taskCounts.failed > 0 && (
                      <Badge className="bg-red-500/10 px-1 text-[9px] text-red-500">
                        {p.taskCounts.failed} failed
                      </Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="border-t p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              setActiveView("builder");
            }}
          >
            ← Back to Builder
          </Button>
        </div>
      </aside>

      {/* Center: main panel */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <div className="flex items-center gap-2 border-b bg-background px-4 py-2.5">
          <Activity className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Orchestration</h1>
          <span className="text-xs text-muted-foreground">
            {runningCount} running · {queuedCount} queued
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-8"
            onClick={() => setSpawnOpen(true)}
            disabled={!selectedProjectId}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New task
          </Button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 border-b bg-background px-3 py-1.5">
          {(["tasks", "providers", "n8n"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                activeTab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t === "n8n" ? "n8n" : t}
            </button>
          ))}
        </div>

        {/* content */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === "tasks" ? (
            <TaskList
              tasks={tasks}
              hasProject={!!selectedProjectId}
              onRefresh={loadTasks}
            />
          ) : activeTab === "providers" ? (
            <ProvidersPanel providers={providers} onChange={loadProviders} />
          ) : (
            <N8nPanel n8n={n8n} onChange={loadN8n} />
          )}
        </ScrollArea>
      </main>

      <SpawnTaskDialog
        open={spawnOpen}
        onOpenChange={setSpawnOpen}
        projectId={selectedProjectId}
        onCreated={loadTasks}
      />
    </div>
  );
}

// ---------- task list ----------
function TaskList({
  tasks,
  hasProject,
  onRefresh,
}: {
  tasks: TaskRow[];
  hasProject: boolean;
  onRefresh: () => void;
}) {
  if (!hasProject) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Select a project on the left to view its task queue.
        </p>
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Terminal className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
        <p className="text-xs text-muted-foreground">
          Click “New task” to spawn an agent job.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 p-3">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function TaskCard({ task, onRefresh }: { task: TaskRow; onRefresh: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const meta = STATUS_META[task.status] ?? STATUS_META.queued;
  const Icon = meta.icon;
  const isRunning = task.status === "running";

  async function cancel() {
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    toast.success("Task cancelled");
    onRefresh();
  }

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded",
            meta.color,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", isRunning && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {new Date(task.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] capitalize">
              {task.kind.replace("_", " ")}
            </Badge>
            <Badge className={cn("text-[9px]", meta.color)}>{meta.label}</Badge>
            <span className="text-[10px] text-muted-foreground">prio {task.priority}</span>
          </div>
        </div>
        {(task.status === "queued" || isRunning) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive"
            onClick={cancel}
          >
            Cancel
          </Button>
        )}
      </div>

      {task.logs ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? "▼ Hide logs" : "▶ Show logs"}
          </button>
          {expanded && (
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-zinc-950 p-2 text-[10px] leading-relaxed text-zinc-300">
              {task.logs.trim() || "(no logs)"}
            </pre>
          )}
        </div>
      ) : null}

      {task.status === "done" && Object.keys(task.output).length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
            Output ({Object.keys(task.output).length} keys)
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted p-2 text-[10px]">
            {JSON.stringify(task.output, null, 2)}
          </pre>
        </details>
      ) : null}

      {task.status === "failed" && task.output?.error ? (
        <p className="mt-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[10px] text-red-600">
          {String(task.output.error)}
        </p>
      ) : null}
    </div>
  );
}

// ---------- spawn task dialog ----------
function SpawnTaskDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string | null;
  onCreated: () => void;
}) {
  const [kind, setKind] = React.useState("audit_seo");
  const [prompt, setPrompt] = React.useState("");
  const [wpUrl, setWpUrl] = React.useState("");
  const [wpUser, setWpUser] = React.useState("");
  const [wpPass, setWpPass] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  function reset() {
    setKind("audit_seo");
    setPrompt("");
    setWpUrl("");
    setWpUser("");
    setWpPass("");
  }

  async function handleCreate() {
    if (!projectId) return;
    setCreating(true);
    try {
      const input: Record<string, unknown> = {};
      if (kind === "generate_page" || kind === "custom") input.prompt = prompt;
      if (kind === "publish_wp") {
        input.siteUrl = wpUrl;
        input.username = wpUser;
        input.appPassword = wpPass;
        input.status = "draft";
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, kind, input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Task queued: ${kind}`);
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  const kindMeta = TASK_KINDS.find((k) => k.value === kind);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Spawn agent task
          </DialogTitle>
          <DialogDescription>
            Queue a task for the multi-agent runner. It executes concurrently
            using the active provider.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Task kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value} className="text-xs">
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kindMeta ? (
              <p className="mt-1 text-[10px] text-muted-foreground">{kindMeta.desc}</p>
            ) : null}
          </div>

          {(kind === "generate_page" || kind === "custom") && (
            <div>
              <Label className="text-xs">Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  kind === "generate_page"
                    ? "e.g. a pricing section with 3 tiers"
                    : "e.g. summarize the current page and suggest 3 improvements"
                }
                className="mt-1 text-xs"
                rows={3}
              />
            </div>
          )}

          {kind === "publish_wp" && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">WordPress site URL</Label>
                <Input
                  value={wpUrl}
                  onChange={(e) => setWpUrl(e.target.value)}
                  placeholder="https://my-site.com"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Username</Label>
                  <Input
                    value={wpUser}
                    onChange={(e) => setWpUser(e.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">App password</Label>
                  <Input
                    value={wpPass}
                    onChange={(e) => setWpPass(e.target.value)}
                    type="password"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            Queue task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- providers panel ----------
function ProvidersPanel({
  providers,
  onChange,
}: {
  providers: ProviderRow[];
  onChange: () => void;
}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Cpu className="h-4 w-4" /> Model Providers
        </h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3 w-3" /> Add provider
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Route LLM calls to a free local model. Point OpenAI-compatible at
        Ollama on your laptop (e.g. <code>http://192.168.1.10:11434/v1</code>)
        or use the opencode CLI.
      </p>
      <Separator />
      {providers.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No providers configured. Default z-ai cloud is used as fallback.
        </p>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <ProviderRowCard key={p.id} provider={p} onChange={onChange} />
          ))}
        </div>
      )}
      <AddProviderDialog open={adding} onOpenChange={setAdding} onAdded={onChange} />
    </div>
  );
}

function ProviderRowCard({
  provider,
  onChange,
}: {
  provider: ProviderRow;
  onChange: () => void;
}) {
  const [testing, setTesting] = React.useState(false);

  async function activate() {
    await fetch(`/api/providers/${provider.id}/activate`, { method: "POST" });
    toast.success(`${provider.name} activated`);
    onChange();
  }
  async function remove() {
    if (!confirm(`Delete provider "${provider.name}"?`)) return;
    await fetch(`/api/providers/${provider.id}`, { method: "DELETE" });
    toast.success("Provider deleted");
    onChange();
  }
  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: provider.type,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey?.startsWith("•") ? undefined : provider.apiKey,
          model: provider.model,
        }),
      });
      const data = await res.json();
      if (data.ok) toast.success(`Healthy: ${data.detail}`);
      else toast.error(`Unhealthy: ${data.detail}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{provider.name}</p>
            {provider.active && (
              <Badge className="bg-emerald-500 text-[9px]">active</Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {provider.type}
            {provider.model ? ` · ${provider.model}` : ""}
            {provider.baseUrl ? ` · ${provider.baseUrl}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
          </Button>
          {!provider.active && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={activate}>
              Activate
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] hover:text-destructive" onClick={remove}>
            Del
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddProviderDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: () => void;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("openai_compat");
  const [baseUrl, setBaseUrl] = React.useState("http://localhost:11434/v1");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("llama3.1:8b");
  const [active, setActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, baseUrl, apiKey, model, active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Provider added");
      setName("");
      setApiKey("");
      onOpenChange(false);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add model provider</DialogTitle>
          <DialogDescription>
            Free local models via Ollama / LM Studio, or any OpenAI-compatible endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ollama (laptop)" className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai_compat" className="text-xs">OpenAI-compatible (Ollama / LM Studio)</SelectItem>
                <SelectItem value="opencode" className="text-xs">opencode CLI (local agent)</SelectItem>
                <SelectItem value="zai" className="text-xs">z-ai cloud</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "openai_compat" && (
            <>
              <div>
                <Label className="text-xs">Base URL</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Model</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">API key (optional)</Label>
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
            </>
          )}
          {type === "opencode" && (
            <div>
              <Label className="text-xs">Model name</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 h-8 text-xs" />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Set as active provider
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !name}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- n8n panel ----------
function N8nPanel({ n8n, onChange }: { n8n: N8nState | null; onChange: () => void }) {
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [enabled, setEnabled] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (n8n) {
      setBaseUrl(n8n.baseUrl ?? "");
      setApiKey("");
      setEnabled(n8n.enabled);
    }
  }, [n8n]);

  async function save() {
    setSaving(true);
    try {
      const body: { baseUrl: string; enabled: boolean; apiKey?: string } = { baseUrl, enabled };
      if (apiKey) body.apiKey = apiKey;
      const res = await fetch("/api/n8n", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("n8n config saved");
      onChange();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Plug className="h-4 w-4" /> n8n Integration
      </h3>
      <p className="text-[11px] text-muted-foreground">
        Split heavy work between your VPS and laptop. n8n (on the VPS) runs
        workflows and calls back Forge via{" "}
        <code className="rounded bg-muted px-1">POST /api/n8n/webhook</code>;
        Forge can also trigger n8n workflows.
      </p>
      <Separator />
      <div className="space-y-3">
        <div>
          <Label className="text-xs">n8n base URL (VPS)</Label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://vps-ip:5678" className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">n8n API key</Label>
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder={n8n?.hasKey ? "••••• (saved)" : "n8n API key"} className="mt-1 h-8 text-xs" />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save n8n config
        </Button>
      </div>
      <Separator />
      <div className="rounded-md border bg-muted/30 p-2.5 text-[11px]">
        <p className="mb-1 font-medium">Webhook receiver</p>
        <p className="text-muted-foreground">
          In n8n, add an HTTP Request node that POSTs to:
        </p>
        <code className="mt-1 block rounded bg-background px-2 py-1 text-[10px]">
          {typeof window !== "undefined" ? window.location.origin : "https://your-forge-host"}/api/n8n/webhook
        </code>
        <p className="mt-1.5 text-muted-foreground">
          Headers: <code className="rounded bg-background px-1">x-forge-key: &lt;your-api-key&gt;</code>
        </p>
        <p className="mt-1.5 text-muted-foreground">
          Body:{" "}
          <code className="rounded bg-background px-1">
            {"{ projectId, taskKind, title, input }"}
          </code>
        </p>
      </div>
    </div>
  );
}
