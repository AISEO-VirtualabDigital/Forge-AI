"use client";

import * as React from "react";
import { Sparkles, Loader2, Check, AlertTriangle, X, Copy } from "lucide-react";
import { useBuilder } from "@/lib/store";
import { analyzeSeo, buildRobotsTxt, buildSitemapXml } from "@/lib/seo";
import { buildPageContext } from "@/lib/ai-context";
import type { SeoConfig, SeoCheck } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";
  const stroke =
    score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const radius = 32;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/30"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-xl font-bold", color)}>{score}</span>
        <span className="text-[9px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function CheckRow({ c }: { c: SeoCheck }) {
  const Icon =
    c.status === "pass" ? Check : c.status === "warn" ? AlertTriangle : X;
  const color =
    c.status === "pass"
      ? "text-emerald-500 bg-emerald-500/10"
      : c.status === "warn"
      ? "text-amber-500 bg-amber-500/10"
      : "text-red-500 bg-red-500/10";
  return (
    <div className="flex items-start gap-2.5 rounded-md border p-2">
      <div className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded", color)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium leading-tight">{c.label}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
          {c.detail}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 text-center">
      <p className="text-base font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function SeoPanel() {
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const updateSeo = useBuilder((s) => s.updateSeo);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [tips, setTips] = React.useState<string[] | null>(null);

  const analysis = React.useMemo(() => analyzeSeo(blocks, seo), [blocks, seo]);
  const set = (patch: Partial<SeoConfig>) => updateSeo(patch);

  async function handleAiSuggest() {
    setAiLoading(true);
    setTips(null);
    try {
      const res = await fetch("/api/ai/seo-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seo, contentText: analysis.contentText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggestion failed");
      const s = data.raw ? null : data;
      if (s) {
        // apply suggestions
        updateSeo({
          title: s.title ?? seo.title,
          description: s.description ?? seo.description,
          focusKeyword: s.focusKeyword ?? seo.focusKeyword,
          keywords: s.keywords ?? seo.keywords,
          ogTitle: s.ogTitle ?? seo.ogTitle,
          ogDescription: s.ogDescription ?? seo.ogDescription,
          jsonLd: s.jsonLd ?? seo.jsonLd,
        });
        setTips(Array.isArray(s.tips) ? s.tips : []);
        toast.success("Applied AI SEO suggestions");
      } else {
        toast.info("AI returned a non-JSON response; try again.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  }

  const passed = analysis.checks.filter((c) => c.status === "pass").length;
  const total = analysis.checks.length;

  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        {/* Score header */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <ScoreRing score={analysis.score} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">SEO Score</p>
            <p className="text-[11px] text-muted-foreground">
              {passed}/{total} checks passed
            </p>
            <Progress value={analysis.score} className="mt-1.5 h-1.5" />
          </div>
        </div>

        {/* AI suggest */}
        <Button
          className="mt-3 w-full"
          size="sm"
          onClick={handleAiSuggest}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Optimizing…
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI Optimize SEO
            </>
          )}
        </Button>

        {tips && tips.length > 0 ? (
          <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase text-primary">
              AI tips
            </p>
            <ul className="space-y-1">
              {tips.map((t, i) => (
                <li key={i} className="text-[11px] text-muted-foreground">
                  • {t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Tabs defaultValue="checks" className="mt-3">
          <TabsList className="grid h-8 w-full grid-cols-5 text-[10px]">
            <TabsTrigger value="checks">Checks</TabsTrigger>
            <TabsTrigger value="meta">Meta</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>

          {/* CHECKS */}
          <TabsContent value="checks" className="mt-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Words" value={analysis.wordCount} />
              <Stat label="Keyword" value={`${analysis.keywordDensity}%`} />
              <Stat label="Readability" value={analysis.readability} />
              <Stat label="Title" value={`${analysis.titleLength}ch`} />
              <Stat label="Desc" value={`${analysis.descriptionLength}ch`} />
              <Stat
                label="Images"
                value={`${analysis.totalImages - analysis.imagesWithoutAlt}/${analysis.totalImages}`}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(analysis.headingCounts).map(([h, n]) =>
                n > 0 ? (
                  <Badge key={h} variant="secondary" className="text-[10px] uppercase">
                    {h}: {n}
                  </Badge>
                ) : null,
              )}
            </div>
            <Separator />
            <div className="space-y-1.5">
              {analysis.checks.map((c) => (
                <CheckRow key={c.id} c={c} />
              ))}
            </div>
          </TabsContent>

          {/* META */}
          <TabsContent value="meta" className="mt-3 space-y-3">
            <Field
              label="Title"
              hint={`${analysis.titleLength} chars (aim 30–60)`}
            >
              <Input
                value={seo.title}
                onChange={(e) => set({ title: e.target.value })}
                className="h-8 text-xs"
                maxLength={70}
              />
            </Field>
            <Field
              label="Meta description"
              hint={`${analysis.descriptionLength} chars (aim 70–160)`}
            >
              <Textarea
                value={seo.description}
                onChange={(e) => set({ description: e.target.value })}
                className="text-xs"
                rows={3}
                maxLength={200}
              />
            </Field>
            <Field label="Focus keyword">
              <Input
                value={seo.focusKeyword}
                onChange={(e) => set({ focusKeyword: e.target.value })}
                className="h-8 text-xs"
                placeholder="e.g. lightweight website builder"
              />
            </Field>
            <Field label="Keywords (comma separated)">
              <Input
                value={seo.keywords}
                onChange={(e) => set({ keywords: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="Canonical URL">
              <Input
                value={seo.canonical}
                onChange={(e) => set({ canonical: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Robots">
                <Input
                  value={seo.robots}
                  onChange={(e) => set({ robots: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="index, follow"
                />
              </Field>
              <Field label="Author">
                <Input
                  value={seo.author}
                  onChange={(e) => set({ author: e.target.value })}
                  className="h-8 text-xs"
                />
              </Field>
            </div>
            <Field label="Language">
              <Input
                value={seo.lang}
                onChange={(e) => set({ lang: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>

            {/* SERP preview */}
            <div className="rounded-md border p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Search result preview
              </p>
              <p className="truncate text-sm text-[#1a0dab]">
                {seo.title || "Untitled page"}
              </p>
              <p className="truncate text-[11px] text-emerald-700">
                {seo.canonical || "https://example.com"}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {seo.description || "No description set."}
              </p>
            </div>
          </TabsContent>

          {/* SOCIAL */}
          <TabsContent value="social" className="mt-3 space-y-3">
            <Field label="OG title">
              <Input
                value={seo.ogTitle}
                onChange={(e) => set({ ogTitle: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="OG description">
              <Textarea
                value={seo.ogDescription}
                onChange={(e) => set({ ogDescription: e.target.value })}
                className="text-xs"
                rows={2}
              />
            </Field>
            <Field label="OG image URL">
              <Input
                value={seo.ogImage}
                onChange={(e) => set({ ogImage: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <Field label="OG type">
              <Input
                value={seo.ogType}
                onChange={(e) => set({ ogType: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>
            <Separator />
            <Field label="Twitter card">
              <Select
                value={seo.twitterCard}
                onValueChange={(v) =>
                  set({ twitterCard: v as SeoConfig["twitterCard"] })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">summary</SelectItem>
                  <SelectItem value="summary_large_image">
                    summary_large_image
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Twitter site (@handle)">
              <Input
                value={seo.twitterSite}
                onChange={(e) => set({ twitterSite: e.target.value })}
                className="h-8 text-xs"
              />
            </Field>

            {/* Social card preview */}
            <div className="overflow-hidden rounded-md border">
              <div className="aspect-[1.91/1] bg-muted">
                {seo.ogImage ? (
                  <img
                    src={seo.ogImage}
                    alt="OG preview"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="p-2">
                <p className="truncate text-[10px] uppercase text-muted-foreground">
                  {seo.canonical || "example.com"}
                </p>
                <p className="truncate text-xs font-semibold">
                  {seo.ogTitle || seo.title}
                </p>
                <p className="line-clamp-2 text-[11px] text-muted-foreground">
                  {seo.ogDescription || seo.description}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* SCHEMA */}
          <TabsContent value="schema" className="mt-3 space-y-3">
            <Field
              label="JSON-LD structured data"
              hint="Valid JSON-LD for rich results (WebSite, Organization, Article…)"
            >
              <Textarea
                value={seo.jsonLd}
                onChange={(e) => set({ jsonLd: e.target.value })}
                className="font-mono text-[11px]"
                rows={12}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={() => {
                  set({
                    jsonLd: JSON.stringify(
                      {
                        "@context": "https://schema.org",
                        "@type": "Organization",
                        name: seo.title.split("—")[0].trim() || "My Company",
                        url: seo.canonical || "https://example.com",
                        logo: seo.ogImage || undefined,
                      },
                      null,
                      2,
                    ),
                  });
                  toast.success("Inserted Organization schema");
                }}
              >
                Organization
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={() => {
                  set({
                    jsonLd: JSON.stringify(
                      {
                        "@context": "https://schema.org",
                        "@type": "WebSite",
                        name: seo.title.split("—")[0].trim() || "My Site",
                        url: seo.canonical || "https://example.com",
                      },
                      null,
                      2,
                    ),
                  });
                  toast.success("Inserted WebSite schema");
                }}
              >
                WebSite
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={() => {
                  set({
                    jsonLd: JSON.stringify(
                      {
                        "@context": "https://schema.org",
                        "@type": "FAQPage",
                        mainEntity: [
                          {
                            "@type": "Question",
                            name: "What is this about?",
                            acceptedAnswer: {
                              "@type": "Answer",
                              text: "Edit this answer.",
                            },
                          },
                        ],
                      },
                      null,
                      2,
                    ),
                  });
                  toast.success("Inserted FAQ schema");
                }}
              >
                FAQ
              </Button>
            </div>
          </TabsContent>

          {/* FILES */}
          <TabsContent value="files" className="mt-3 space-y-3">
            <Field label="robots.txt">
              <Textarea
                readOnly
                value={buildRobotsTxt(seo)}
                className="font-mono text-[11px]"
                rows={4}
              />
            </Field>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => {
                navigator.clipboard.writeText(buildRobotsTxt(seo));
                toast.success("Copied robots.txt");
              }}
            >
              <Copy className="mr-1.5 h-3 w-3" /> Copy robots.txt
            </Button>
            <Field label="sitemap.xml">
              <Textarea
                readOnly
                value={buildSitemapXml(seo)}
                className="font-mono text-[11px]"
                rows={8}
              />
            </Field>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => {
                navigator.clipboard.writeText(buildSitemapXml(seo));
                toast.success("Copied sitemap.xml");
              }}
            >
              <Copy className="mr-1.5 h-3 w-3" /> Copy sitemap.xml
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
