"use client";

import { Layers, Search, Sparkles, Zap } from "lucide-react";
import { useBuilder } from "@/lib/store";
import { analyzeSeo } from "@/lib/seo";

export function Footer() {
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const mode = useBuilder((s) => s.mode);
  const analysis = analyzeSeo(blocks, seo);
  const scoreColor =
    analysis.score >= 80
      ? "text-emerald-500"
      : analysis.score >= 50
      ? "text-amber-500"
      : "text-red-500";

  return (
    <footer className="mt-auto flex h-8 shrink-0 items-center justify-between border-t bg-background px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" />
          {blocks.length} blocks
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <Sparkles className="h-3 w-3" />
          Mode: <span className="capitalize text-foreground">{mode}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1 sm:flex">
          <Search className="h-3 w-3" />
          SEO score:{" "}
          <span className={`font-semibold ${scoreColor}`}>{analysis.score}/100</span>
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-primary" />
          Forge Builder
        </span>
      </div>
    </footer>
  );
}
