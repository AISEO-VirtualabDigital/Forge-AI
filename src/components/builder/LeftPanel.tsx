"use client";

import * as React from "react";
import { Sparkles, Loader2, Search } from "lucide-react";
import { BLOCK_DEFINITIONS, createBlock } from "@/lib/blocks";
import type { Block, BlockType } from "@/lib/types";
import { useBuilder } from "@/lib/store";
import { PaletteDraggableItem } from "./Canvas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { buildPageContext } from "@/lib/ai-context";

const CATEGORY_LABELS: Record<string, string> = {
  layout: "Layout",
  content: "Content",
  media: "Media",
  marketing: "Marketing",
};

export function LeftPanel() {
  const addBlock = useBuilder((s) => s.addBlock);
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const [query, setQuery] = React.useState("");
  const [aiPrompt, setAiPrompt] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);

  const grouped = React.useMemo(() => {
    const filtered = BLOCK_DEFINITIONS.filter((d) =>
      query.trim()
        ? d.label.toLowerCase().includes(query.toLowerCase()) ||
          d.type.includes(query.toLowerCase())
        : true,
    );
    const map: Record<string, typeof BLOCK_DEFINITIONS> = {};
    for (const d of filtered) {
      (map[d.category] ??= []).push(d);
    }
    return map;
  }, [query]);

  async function handleAiGenerate() {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiLoading(true);
    try {
      const context = buildPageContext(blocks, seo);
      const res = await fetch("/api/ai/generate-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      const specs: { type: BlockType; props?: Record<string, unknown>; style?: Record<string, unknown> }[] =
        Array.isArray(data.blocks) ? data.blocks : [];
      if (specs.length === 0) {
        toast.error("AI returned no blocks. Try a different prompt.");
        return;
      }
      const newBlocks: Block[] = specs
        .filter((s) => s && s.type)
        .map((spec) => {
          const block = createBlock(spec.type as BlockType);
          if (spec.props) block.props = { ...block.props, ...(spec.props as object) };
          if (spec.style) block.style = { ...block.style, ...(spec.style as object) };
          return block;
        });
      useBuilder.getState().replaceBlocks([...blocks, ...newBlocks]);
      toast.success(`Added ${newBlocks.length} block${newBlocks.length > 1 ? "s" : ""} from AI`);
      setAiPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b p-3">
        <h2 className="text-sm font-semibold">Blocks</h2>
        <p className="text-xs text-muted-foreground">
          Drag onto the canvas or click to add
        </p>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {Object.entries(grouped).map(([cat, defs]) => (
            <div key={cat} className="mb-4">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="flex flex-col gap-1.5">
                {defs.map((d) => (
                  <PaletteDraggableItem key={d.type} type={d.type} />
                ))}
                {/* click-to-add fallback */}
                <div className="flex flex-wrap gap-1">
                  {defs.map((d) => (
                    <button
                      key={`add-${d.type}`}
                      type="button"
                      onClick={() => addBlock(d.type)}
                      className="rounded border bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-accent"
                      title={`Add ${d.label}`}
                    >
                      + {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* AI generation */}
      <div className="border-t bg-muted/30 p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-semibold">Generate with AI</h3>
        </div>
        <p className="mb-2 text-[10px] text-muted-foreground">
          Describe a section, e.g. “a pricing section with 3 tiers”
        </p>
        <Input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !aiLoading) handleAiGenerate();
          }}
          placeholder="Describe what to build…"
          className="h-8 text-xs"
          disabled={aiLoading}
        />
        <Button
          type="button"
          size="sm"
          className="mt-2 w-full"
          onClick={handleAiGenerate}
          disabled={aiLoading || !aiPrompt.trim()}
        >
          {aiLoading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Generate blocks
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
