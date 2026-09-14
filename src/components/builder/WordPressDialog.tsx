"use client";

import * as React from "react";
import {
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
  Upload,
  FileText,
  ExternalLink,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useBuilder } from "@/lib/store";
import { blocksToHtml } from "@/lib/ai-context";
import type { WordPressPost } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WordPressDialog({ open, onOpenChange }: Props) {
  const wp = useBuilder((s) => s.wordpress);
  const setWordPress = useBuilder((s) => s.setWordPress);
  const wpConnected = useBuilder((s) => s.wpConnected);
  const setWpConnected = useBuilder((s) => s.setWpConnected);

  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const customCode = useBuilder((s) => s.customCode);
  const mode = useBuilder((s) => s.mode);
  const projectName = useBuilder((s) => s.projectName);

  const [testing, setTesting] = React.useState(false);
  const [siteName, setSiteName] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [status, setStatus] = React.useState<"draft" | "publish" | "private">("draft");
  const [posts, setPosts] = React.useState<WordPressPost[]>([]);
  const [loadingPosts, setLoadingPosts] = React.useState(false);
  const [publishedLink, setPublishedLink] = React.useState<string | null>(null);

  const canConnect =
    wp.siteUrl.trim() && wp.username.trim() && wp.appPassword.trim();

  async function handleTest() {
    if (!canConnect) {
      toast.error("Fill in site URL, username and app password.");
      return;
    }
    setTesting(true);
    setSiteName(null);
    try {
      const res = await fetch("/api/wordpress/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wp),
      });
      const data = await res.json();
      if (res.ok && data.connected) {
        setWpConnected(true);
        setSiteName(data.siteName ?? wp.siteUrl);
        toast.success(`Connected to ${data.siteName ?? "WordPress"}`);
      } else {
        setWpConnected(false);
        toast.error(data.error || "Connection failed");
      }
    } catch (e) {
      setWpConnected(false);
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  function buildContent(): string {
    if (mode === "code") {
      return `<div class="forge-page">\n${customCode}\n</div>`;
    }
    // Extract just the <body> inner HTML from the full export so WP doesn't
    // get a second <html>/<head>.
    const full = blocksToHtml(blocks, seo);
    const bodyMatch = full.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1].trim() : full;
  }

  async function handlePublish() {
    if (!wpConnected) {
      toast.error("Test the connection first.");
      return;
    }
    setPublishing(true);
    setPublishedLink(null);
    try {
      const title = seo.title || projectName || "Untitled page";
      const content = buildContent();
      const slug = (projectName || "forge-page")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const res = await fetch("/api/wordpress/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: wp,
          title,
          content,
          status,
          slug,
          excerpt: seo.description,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPublishedLink(data.post.link);
        toast.success(
          status === "publish"
            ? "Published to WordPress!"
            : `Saved as ${status} on WordPress`,
        );
        // Refresh the posts list.
        void loadPosts();
      } else {
        toast.error(data.error || "Publish failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  async function loadPosts() {
    if (!wpConnected) return;
    setLoadingPosts(true);
    try {
      const res = await fetch("/api/wordpress/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: wp, perPage: 8 }),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts(Array.isArray(data.posts) ? data.posts : []);
      } else {
        toast.error(data.error || "Could not load posts");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load posts");
    } finally {
      setLoadingPosts(false);
    }
  }

  React.useEffect(() => {
    if (open && wpConnected && posts.length === 0) {
      void loadPosts();
    }
    if (!open) {
      setPublishedLink(null);
    }
  }, [open, wpConnected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> WordPress Connector
          </DialogTitle>
          <DialogDescription>
            Connect to a WordPress site and publish your page as a post. Uses the
            WordPress REST API with an Application Password.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[64vh] pr-1">
          <div className="space-y-4">
            {/* Credentials */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Site URL</Label>
                <Input
                  value={wp.siteUrl}
                  onChange={(e) => setWordPress({ siteUrl: e.target.value })}
                  placeholder="https://my-site.com"
                  className="mt-1 h-8 text-xs"
                  type="url"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Username</Label>
                  <Input
                    value={wp.username}
                    onChange={(e) => setWordPress({ username: e.target.value })}
                    placeholder="admin"
                    className="mt-1 h-8 text-xs"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label className="text-xs">App password</Label>
                  <Input
                    value={wp.appPassword}
                    onChange={(e) => setWordPress({ appPassword: e.target.value })}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="mt-1 h-8 text-xs"
                    type="password"
                    autoComplete="off"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Create an app password at: WP Admin → Users → Profile →
                Application Passwords.
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleTest}
                  disabled={!canConnect || testing}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Testing…
                    </>
                  ) : (
                    "Test connection"
                  )}
                </Button>
                {wpConnected ? (
                  <Badge className="bg-emerald-500 text-[10px]">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
                    {siteName ? ` · ${siteName}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    <XCircle className="mr-1 h-3 w-3" /> Not connected
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* Publish */}
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs">Publish as</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as typeof status)}
                  disabled={!wpConnected || publishing}
                >
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="publish">Publish immediately</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Title: <span className="font-medium text-foreground">{seo.title || projectName}</span>
                {" · "}
                {blocks.length} blocks will be converted to HTML.
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={handlePublish}
                disabled={!wpConnected || publishing}
              >
                {publishing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Publishing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Publish to WordPress
                  </>
                )}
              </Button>

              {publishedLink ? (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-emerald-600">
                    Published
                  </p>
                  <a
                    href={publishedLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {publishedLink}
                  </a>
                </div>
              ) : null}
            </div>

            <Separator />

            {/* Recent posts */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent posts
                </h4>
                {wpConnected ? (
                  <button
                    type="button"
                    onClick={loadPosts}
                    disabled={loadingPosts}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    title="Refresh"
                  >
                    <RefreshCw
                      className={cn("h-3 w-3", loadingPosts && "animate-spin")}
                    />
                  </button>
                ) : null}
              </div>
              {!wpConnected ? (
                <p className="text-[11px] text-muted-foreground">
                  Connect to WordPress to see your recent posts.
                </p>
              ) : loadingPosts ? (
                <p className="text-[11px] text-muted-foreground">Loading…</p>
              ) : posts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No posts found on this site.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {posts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {p.title?.rendered ?? p.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(p.date).toLocaleDateString()} · /{p.slug}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 text-[9px] capitalize",
                          p.status === "publish" && "border-emerald-500/40 text-emerald-600",
                        )}
                      >
                        {p.status}
                      </Badge>
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Open in WordPress"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Clear credentials */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("Clear stored WordPress credentials?")) {
                  setWordPress({
                    siteUrl: "",
                    username: "",
                    appPassword: "",
                  });
                  setWpConnected(false);
                  setPosts([]);
                  setSiteName(null);
                  toast.success("Credentials cleared");
                }
              }}
            >
              <Trash2 className="mr-1.5 h-3 w-3" /> Clear stored credentials
            </Button>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
