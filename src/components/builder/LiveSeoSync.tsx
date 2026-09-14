"use client";

import * as React from "react";
import {
  Link2,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Download,
  Upload,
} from "lucide-react";
import { useBuilder } from "@/lib/store";
import type { SeoConfig, WordPressConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WpPost {
  id: number;
  title: string;
  status: string;
  slug: string;
  link: string;
  date: string;
  modified: string;
}

interface SeoStatus {
  installed?: boolean;
  authenticated?: boolean;
  plugin_version?: string;
  site_name?: string;
  active_plugins?: { yoast: boolean; rank_math: boolean };
  versions?: { yoast?: string; rank_math?: string };
  primary?: "yoast" | "rank_math" | "none";
  message?: string;
}

interface SeoGetResult {
  post_id: number;
  seo: Partial<SeoConfig> & { __post?: { id: number; title: string; slug: string; status: string; link: string } };
}

interface SeoPutResult {
  success: boolean;
  post_id: number;
  written_to: string[];
  seo: Partial<SeoConfig>;
}

interface Props {
  config: WordPressConfig | null;
  connected: boolean;
}

export function LiveSeoSync({ config, connected }: Props) {
  const seo = useBuilder((s) => s.seo);
  const updateSeo = useBuilder((s) => s.updateSeo);

  const [status, setStatus] = React.useState<SeoStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = React.useState(false);
  const [posts, setPosts] = React.useState<WpPost[]>([]);
  const [selectedPostId, setSelectedPostId] = React.useState<string>("");
  const [loadingPosts, setLoadingPosts] = React.useState(false);
  const [syncing, setSyncing] = React.useState<"pull" | "push" | null>(null);
  const [diff, setDiff] = React.useState<
    { field: string; forge: string; wp: string }[] | null
  >(null);

  // Check connector plugin status whenever the dialog opens with a connection.
  React.useEffect(() => {
    if (connected && config) {
      void checkStatus();
    } else {
      setStatus(null);
      setPosts([]);
      setSelectedPostId("");
    }
  }, [connected, config?.siteUrl]);

  async function checkStatus() {
    if (!config) return;
    setCheckingStatus(true);
    try {
      const res = await fetch("/api/wordpress/seo-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = (await res.json()) as SeoStatus;
      setStatus(data);
      if (data.installed && data.authenticated) {
        void loadPosts();
      }
    } catch {
      setStatus(null);
    } finally {
      setCheckingStatus(false);
    }
  }

  async function loadPosts() {
    if (!config) return;
    setLoadingPosts(true);
    try {
      // Use the standard WP REST API to list posts (works regardless of plugin).
      const res = await fetch("/api/wordpress/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, perPage: 15 }),
      });
      const data = await res.json();
      if (res.ok) {
        const p: WpPost[] = Array.isArray(data.posts) ? data.posts : [];
        setPosts(p);
        if (p.length > 0 && !selectedPostId) {
          setSelectedPostId(String(p[0].id));
        }
      }
    } catch {
      // silent — the posts list is a convenience.
    } finally {
      setLoadingPosts(false);
    }
  }

  async function handlePull() {
    if (!config || !selectedPostId) {
      toast.error("Select a WordPress post first.");
      return;
    }
    setSyncing("pull");
    setDiff(null);
    try {
      const res = await fetch("/api/wordpress/seo-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, postId: Number(selectedPostId) }),
      });
      const data = (await res.json()) as SeoGetResult | { error: string };
      if (!res.ok) {
        throw new Error(
          (data as { error: string }).error || "Failed to read SEO from WP",
        );
      }
      const wpSeo = (data as SeoGetResult).seo;
      // Compute a diff to show the user what changed.
      const fields: { field: string; forge: string; wp: string }[] = [];
      const keys: (keyof SeoConfig)[] = [
        "title",
        "description",
        "focusKeyword",
        "canonical",
        "ogTitle",
        "ogDescription",
      ];
      for (const k of keys) {
        const forgeVal = String(seo[k] ?? "");
        const wpVal = String(wpSeo[k] ?? "");
        if (forgeVal !== wpVal) {
          fields.push({
            field: k,
            forge: forgeVal || "(empty)",
            wp: wpVal || "(empty)",
          });
        }
      }
      setDiff(fields);

      // Apply the WP values into Forge's store.
      const patch: Partial<SeoConfig> = {};
      for (const k of Object.keys(wpSeo)) {
        if (k.startsWith("__")) continue;
        (patch as Record<string, unknown>)[k] = wpSeo[k as keyof SeoConfig];
      }
      updateSeo(patch);
      toast.success(`Pulled live SEO from WordPress post #${selectedPostId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setSyncing(null);
    }
  }

  async function handlePush() {
    if (!config || !selectedPostId) {
      toast.error("Select a WordPress post first.");
      return;
    }
    setSyncing("push");
    setDiff(null);
    try {
      const res = await fetch("/api/wordpress/seo-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, postId: Number(selectedPostId), seo }),
      });
      const data = (await res.json()) as SeoPutResult | { error: string };
      if (!res.ok) {
        throw new Error(
          (data as { error: string }).error || "Failed to push SEO to WP",
        );
      }
      const result = data as SeoPutResult;
      toast.success(
        `Pushed SEO to ${result.written_to.join(" + ")} on post #${selectedPostId}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push failed");
    } finally {
      setSyncing(null);
    }
  }

  const pluginReady = status?.installed && status?.authenticated;
  const activeLabels: string[] = [];
  if (status?.active_plugins?.yoast) activeLabels.push("Yoast");
  if (status?.active_plugins?.rank_math) activeLabels.push("Rank Math");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Live SEO Sync</p>
          {status?.installed ? (
            <Badge className="bg-emerald-500 text-[10px]">
              Connector v{status.plugin_version}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Not installed
            </Badge>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Push Forge's SEO settings to (or pull them from) a live WordPress
          post. Works with Yoast SEO and Rank Math automatically.
        </p>
      </div>

      {/* Plugin status */}
      {!connected ? (
        <p className="text-[11px] text-muted-foreground">
          Connect to WordPress above to enable live SEO sync.
        </p>
      ) : checkingStatus ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking connector
          plugin…
        </p>
      ) : !status?.installed ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Forge SEO Connector plugin not detected
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Install it to enable two-way sync. The plugin is in the
            <code className="mx-1 rounded bg-muted px-1 py-0.5">
              wordpress-plugin/forge-seo-connector
            </code>
            folder of this project — zip it and upload via WP Admin → Plugins
            → Add New → Upload Plugin.
          </p>
        </div>
      ) : (
        <div className="rounded-md border p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeLabels.length > 0 ? (
              activeLabels.map((l) => (
                <Badge key={l} variant="default" className="text-[10px]">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> {l}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="text-[10px]">
                <XCircle className="mr-1 h-3 w-3" /> No SEO plugin
              </Badge>
            )}
            {status.site_name ? (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {status.site_name}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Writes go to {activeLabels.join(" + ") || "generic meta"} — reads
            come from {status.primary === "rank_math"
              ? "Rank Math"
              : status.primary === "yoast"
              ? "Yoast"
              : "generic meta"}.
          </p>
        </div>
      )}

      {/* Post picker + sync buttons */}
      {pluginReady ? (
        <div className="space-y-2.5">
          <div>
            <Label className="text-xs">WordPress post</Label>
            <Select
              value={selectedPostId}
              onValueChange={setSelectedPostId}
              disabled={loadingPosts || posts.length === 0}
            >
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue
                  placeholder={
                    loadingPosts
                      ? "Loading posts…"
                      : posts.length === 0
                      ? "No posts found"
                      : "Select a post"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {posts.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    #{p.id} · {p.title || "(untitled)"} · {p.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handlePull}
              disabled={!selectedPostId || syncing !== null}
            >
              {syncing === "pull" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
              )}
              Pull from WP
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={handlePush}
              disabled={!selectedPostId || syncing !== null}
            >
              {syncing === "push" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
              )}
              Push to WP
            </Button>
          </div>

          {/* Diff summary after a pull */}
          {diff !== null ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase text-primary">
                {diff.length === 0
                  ? "No differences — Forge SEO matched WordPress"
                  : `${diff.length} field(s) updated from WordPress`}
              </p>
              {diff.length > 0 ? (
                <div className="space-y-1">
                  {diff.map((d) => (
                    <div key={d.field} className="text-[10px]">
                      <span className="font-medium">{d.field}:</span>{" "}
                      <span className="text-muted-foreground line-through">
                        {truncate(d.forge)}
                      </span>{" "}
                      → <span className="text-foreground">{truncate(d.wp)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="text-[10px] text-muted-foreground">
            <ShieldCheck className="mr-1 inline h-2.5 w-2.5" />
            Synced via Basic Auth to <code>forge-seo/v1</code>. Forge's SEO
            config: <span className="font-medium text-foreground">{seo.title.slice(0, 40) || "(no title)"}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function truncate(s: string, n = 50): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
