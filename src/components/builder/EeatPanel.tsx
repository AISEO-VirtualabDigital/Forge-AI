"use client";

import * as React from "react";
import { Sparkles, Loader2, Check, AlertTriangle, X } from "lucide-react";
import { useBuilder } from "@/lib/store";
import { analyzeEeat } from "@/lib/eeat";
import type { EeatDimension } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface EeatNarrative {
  narrative?: string;
  strengths?: string[];
  improvements?: string[];
  priorityAction?: string;
}

const DIM_COLORS: Record<EeatDimension, string> = {
  experience: "from-rose-500 to-rose-400",
  expertise: "from-violet-500 to-violet-400",
  authoritativeness: "from-amber-500 to-amber-400",
  trustworthiness: "from-emerald-500 to-emerald-400",
};

const DIM_SHORT: Record<EeatDimension, string> = {
  experience: "Experience",
  expertise: "Expertise",
  authoritativeness: "Authority",
  trustworthiness: "Trust",
};

function DimBar({ dim, score }: { dim: EeatDimension; score: number }) {
  const color =
    score >= 75 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium">{DIM_SHORT[dim]}</span>
        <span className="text-xs font-bold">{score}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export function EeatPanel() {
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const analysis = React.useMemo(() => analyzeEeat(blocks, seo), [blocks, seo]);

  const [aiLoading, setAiLoading] = React.useState(false);
  const [narrative, setNarrative] = React.useState<EeatNarrative | null>(null);

  async function handleAi() {
    setAiLoading(true);
    setNarrative(null);
    try {
      const res = await fetch("/api/ai/eeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentText: analysis.contentText,
          seo,
          signals: analysis.signals,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "EEAT analysis failed");
      if (data.raw) {
        toast.info("AI returned raw text; try again.");
        return;
      }
      setNarrative(data);
      toast.success("E-E-A-T analysis complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAiLoading(false);
    }
  }

  const dims = Object.keys(analysis.dimensions) as EeatDimension[];
  const passed = analysis.checks.filter((c) => c.status === "pass").length;

  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        {/* Score header */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <div className="text-center">
              <p className="text-lg font-bold leading-none">{analysis.score}</p>
              <p className="text-[8px] opacity-80">/ 100</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">E-E-A-T Score</p>
            <p className="text-[11px] text-muted-foreground">
              {passed}/{analysis.checks.length} signals passed
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Experience · Expertise · Authoritativeness · Trustworthiness
            </p>
          </div>
        </div>

        {/* Dimension bars */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {dims.map((d) => (
            <div
              key={d}
              className={cn(
                "rounded-md bg-gradient-to-br p-0.5",
                DIM_COLORS[d],
              )}
            >
              <div className="rounded-[5px] bg-background p-2">
                <DimBar dim={d} score={analysis.dimensions[d].score} />
              </div>
            </div>
          ))}
        </div>

        {/* AI narrative */}
        <Button
          className="mt-3 w-full"
          size="sm"
          onClick={handleAi}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI E-E-A-T Analysis
            </>
          )}
        </Button>

        {narrative ? (
          <div className="mt-3 space-y-2">
            {narrative.narrative ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <p className="text-[11px] leading-relaxed text-foreground">
                  {narrative.narrative}
                </p>
              </div>
            ) : null}
            {narrative.priorityAction ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
                <p className="mb-0.5 text-[10px] font-semibold uppercase text-amber-600">
                  Priority action
                </p>
                <p className="text-[11px] text-foreground">
                  {narrative.priorityAction}
                </p>
              </div>
            ) : null}
            {narrative.strengths && narrative.strengths.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase text-emerald-600">
                  Strengths
                </p>
                <ul className="space-y-0.5">
                  {narrative.strengths.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px]">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {narrative.improvements && narrative.improvements.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase text-amber-600">
                  Improvements
                </p>
                <ul className="space-y-0.5">
                  {narrative.improvements.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px]">
                      <span className="mt-0.5 text-amber-500">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <Separator className="my-3" />

        {/* Signals detected */}
        <div>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detected signals
          </h4>
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={analysis.signals.hasAuthorBio ? "default" : "outline"}
              className="text-[10px]"
            >
              Author bio
            </Badge>
            <Badge
              variant={analysis.signals.hasContactInfo ? "default" : "outline"}
              className="text-[10px]"
            >
              Contact info
            </Badge>
            <Badge
              variant={analysis.signals.hasAboutMention ? "default" : "outline"}
              className="text-[10px]"
            >
              About / team
            </Badge>
            <Badge
              variant={analysis.signals.hasFirstPerson ? "default" : "outline"}
              className="text-[10px]"
            >
              First-person ({analysis.signals.firstPersonCount})
            </Badge>
            <Badge
              variant={analysis.signals.hasCitations ? "default" : "outline"}
              className="text-[10px]"
            >
              Citations ({analysis.signals.citationCount})
            </Badge>
            <Badge
              variant={analysis.signals.hasHttps ? "default" : "outline"}
              className="text-[10px]"
            >
              HTTPS
            </Badge>
            <Badge
              variant={analysis.signals.hasSchema ? "default" : "outline"}
              className="text-[10px]"
            >
              Schema
            </Badge>
            <Badge
              variant={analysis.signals.hasDates ? "default" : "outline"}
              className="text-[10px]"
            >
              Dates
            </Badge>
            <Badge
              variant={analysis.signals.hasDisclaimers ? "default" : "outline"}
              className="text-[10px]"
            >
              Disclaimers
            </Badge>
            <Badge
              variant={analysis.signals.hasExternalLinks ? "default" : "outline"}
              className="text-[10px]"
            >
              External links
            </Badge>
          </div>
        </div>

        <Separator className="my-3" />

        {/* All checks */}
        <div>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            E-E-A-T checklist
          </h4>
          <div className="space-y-1.5">
            {analysis.checks.map((c) => {
              const Icon =
                c.status === "pass"
                  ? Check
                  : c.status === "warn"
                  ? AlertTriangle
                  : X;
              const color =
                c.status === "pass"
                  ? "text-emerald-500 bg-emerald-500/10"
                  : c.status === "warn"
                  ? "text-amber-500 bg-amber-500/10"
                  : "text-red-500 bg-red-500/10";
              return (
                <div key={c.id} className="flex items-start gap-2.5 rounded-md border p-2">
                  <div
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded",
                      color,
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium leading-tight">{c.label}</p>
                      <span className="shrink-0 text-[9px] uppercase text-muted-foreground">
                        {DIM_SHORT[c.dimension]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                      {c.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
