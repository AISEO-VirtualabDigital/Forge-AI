"use client";

import * as React from "react";
import {
  Sparkles,
  Loader2,
  Link2,
  ExternalLink,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useBuilder } from "@/lib/store";
import { extractContentText } from "@/lib/seo";
import type { Block, InternalLinkSuggestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function InternalLinksPanel() {
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const updateBlockProps = useBuilder((s) => s.updateBlockProps);

  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<InternalLinkSuggestion[]>([]);

  // Collect existing links across nav/button/cta/footer blocks.
  const existingLinks = React.useMemo(() => {
    const out: { text: string; href: string; blockId: string; blockType: string }[] = [];
    for (const b of blocks) {
      if (b.type === "nav" || b.type === "footer") {
        for (const l of b.props.links ?? []) {
          out.push({ text: l.label, href: l.href, blockId: b.id, blockType: b.type });
        }
      }
      if (b.type === "button" || b.type === "hero" || b.type === "cta") {
        const href = b.props.ctaHref ?? b.props.href;
        if (href) {
          out.push({
            text: String(b.props.ctaText ?? b.props.text ?? ""),
            href,
            blockId: b.id,
            blockType: b.type,
          });
        }
      }
    }
    return out;
  }, [blocks]);

  const contentText = React.useMemo(() => extractContentText(blocks), [blocks]);

  async function handleAnalyze() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/internal-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentText, blocks, seo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      const s: InternalLinkSuggestion[] = Array.isArray(data.suggestions)
        ? data.suggestions
        : [];
      setSuggestions(s);
      if (s.length === 0) {
        toast.info("No internal-link opportunities detected yet.");
      } else {
        toast.success(`Found ${s.length} internal-link opportunities`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // Apply a suggestion by finding a paragraph whose text contains the anchor
  // and appending a link reference. We update the first matching paragraph's
  // text to wrap the anchor in a markdown-style link note (since our paragraph
  // block renders plain text, we instead add a button block beneath it).
  function applySuggestion(s: InternalLinkSuggestion) {
    // Try to find a paragraph block whose text contains the anchor text.
    const anchorLower = s.anchorText.toLowerCase();
    const matchIdx = blocks.findIndex(
      (b) =>
        b.type === "paragraph" &&
        typeof b.props.text === "string" &&
        b.props.text.toLowerCase().includes(anchorLower),
    );

    if (matchIdx !== -1) {
      const b = blocks[matchIdx];
      const text = String(b.props.text);
      // Replace the first occurrence of the anchor with a bracketed link marker.
      const re = new RegExp(
        `(${s.anchorText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "i",
      );
      const updated = text.replace(
        re,
        `$1 → ${s.suggestedTarget}`,
      );
      updateBlockProps(b.id, { text: updated });
      setSuggestions((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, applied: true } : x)),
      );
      toast.success(`Linked "${s.anchorText}" → ${s.suggestedTarget}`);
    } else {
      // No matching paragraph — copy a ready-to-paste HTML link to clipboard.
      const html = `<a href="${s.suggestedTarget}">${s.anchorText}</a>`;
      navigator.clipboard.writeText(html);
      toast.info(
        `No matching text found. Copied <a> tag for "${s.anchorText}" — paste into a paragraph.`,
      );
      setSuggestions((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, applied: true } : x)),
      );
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        {/* Header */}
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Internal Linking</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            AI analyzes your page content and suggests contextual internal
            links to related pages and sections.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-background p-2 text-center">
              <p className="text-base font-bold">{existingLinks.length}</p>
              <p className="text-[10px] text-muted-foreground">Existing links</p>
            </div>
            <div className="rounded-md bg-background p-2 text-center">
              <p className="text-base font-bold">{suggestions.length}</p>
              <p className="text-[10px] text-muted-foreground">Opportunities</p>
            </div>
          </div>
        </div>

        <Button
          className="mt-3 w-full"
          size="sm"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Analyze for internal links
            </>
          )}
        </Button>

        {/* Existing links */}
        <Separator className="my-3" />
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Existing links on page
        </h4>
        {existingLinks.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No nav/button/CTA links yet. Add a navbar or button block first.
          </p>
        ) : (
          <div className="space-y-1.5">
            {existingLinks.map((l, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border p-2"
              >
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {l.text || "(no label)"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {l.href}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[9px] capitalize">
                  {l.blockType}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 ? (
          <>
            <Separator className="my-3" />
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested internal links
              </h4>
              <button
                type="button"
                onClick={handleAnalyze}
                className="text-[10px] text-muted-foreground hover:text-foreground"
                title="Re-run analysis"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-md border p-2 transition-colors",
                    s.applied && "border-emerald-500/40 bg-emerald-500/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        “{s.anchorText}”
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                        <ChevronRight className="h-2.5 w-2.5" />
                        {s.suggestedTarget}
                      </p>
                    </div>
                    {s.applied ? (
                      <Badge variant="default" className="shrink-0 bg-emerald-500 text-[9px]">
                        Applied
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 shrink-0 px-2 text-[10px]"
                        onClick={() => applySuggestion(s)}
                      >
                        Apply
                      </Button>
                    )}
                  </div>
                  {s.reason ? (
                    <p className="mt-1 text-[10px] italic text-muted-foreground">
                      {s.reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* Best practices */}
        <Separator className="my-3" />
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase text-primary">
            Internal linking best practices
          </p>
          <ul className="space-y-0.5 text-[10px] text-muted-foreground">
            <li>• Use descriptive, keyword-rich anchor text (2-6 words).</li>
            <li>• Link to related topical pages, not just the homepage.</li>
            <li>• Aim for 3-8 internal links per page for articles.</li>
            <li>• Avoid duplicate anchor text pointing to different URLs.</li>
            <li>• Keep important pages within 3 clicks of the homepage.</li>
          </ul>
        </div>
      </div>
    </ScrollArea>
  );
}

// Re-export to satisfy potential imports from the parent panel.
export type { Block };
