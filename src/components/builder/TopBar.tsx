"use client";

import * as React from "react";
import {
  MousePointer2,
  Columns2,
  Code2,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  Pencil,
  Download,
  RotateCcw,
  Github,
  Plug,
} from "lucide-react";
import { useBuilder } from "@/lib/store";
import type { EditMode, PreviewDevice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { blocksToHtml } from "@/lib/ai-context";
import { buildRobotsTxt, buildSitemapXml } from "@/lib/seo";
import { WordPressDialog } from "./WordPressDialog";
import { toast } from "sonner";

const MODES: { value: EditMode; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "dragdrop", label: "Drag & Drop", icon: MousePointer2, desc: "Visual builder" },
  { value: "hybrid", label: "Hybrid", icon: Columns2, desc: "Visual + code" },
  { value: "code", label: "Custom Code", icon: Code2, desc: "Write HTML" },
];

const DEVICES: { value: PreviewDevice; icon: React.ElementType }[] = [
  { value: "desktop", icon: Monitor },
  { value: "tablet", icon: Tablet },
  { value: "mobile", icon: Smartphone },
];

function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TopBar() {
  const mode = useBuilder((s) => s.mode);
  const setMode = useBuilder((s) => s.setMode);
  const showPreview = useBuilder((s) => s.showPreview);
  const togglePreview = useBuilder((s) => s.togglePreview);
  const previewDevice = useBuilder((s) => s.previewDevice);
  const setPreviewDevice = useBuilder((s) => s.setPreviewDevice);
  const projectName = useBuilder((s) => s.projectName);
  const setProjectName = useBuilder((s) => s.setProjectName);
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const customCode = useBuilder((s) => s.customCode);
  const resetProject = useBuilder((s) => s.resetProject);
  const wpConnected = useBuilder((s) => s.wpConnected);
  const [wpOpen, setWpOpen] = React.useState(false);

  function handleExport(kind: "html" | "seo-json" | "robots" | "sitemap") {
    const name = projectName.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "site";
    if (kind === "html") {
      const html =
        mode === "code"
          ? `<!DOCTYPE html>\n<html lang="${seo.lang}">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body>\n${customCode}\n</body>\n</html>`
          : blocksToHtml(blocks, seo);
      download(`${name}.html`, html, "text/html");
      toast.success("Exported HTML file");
    } else if (kind === "seo-json") {
      download(`${name}-seo.json`, JSON.stringify(seo, null, 2), "application/json");
      toast.success("Exported SEO config");
    } else if (kind === "robots") {
      download("robots.txt", buildRobotsTxt(seo), "text/plain");
      toast.success("Exported robots.txt");
    } else {
      download("sitemap.xml", buildSitemapXml(seo), "application/xml");
      toast.success("Exported sitemap.xml");
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      {/* Brand */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Github className="h-4 w-4" />
        </div>
        <span className="hidden text-sm font-bold sm:inline">Forge</span>
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      {/* Project name */}
      <Input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="h-8 w-32 text-xs md:w-44"
        aria-label="Project name"
      />

      {/* Mode switcher */}
      <TooltipProvider delayDuration={200}>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as EditMode)}
          className="ml-1"
        >
          {MODES.map((m) => (
            <Tooltip key={m.value}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={m.value}
                  aria-label={m.label}
                  className="h-8 gap-1.5 px-2 text-xs"
                >
                  <m.icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{m.label}</span>
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{m.desc}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <div className="mx-1 h-6 w-px bg-border" />

        {/* Device preview */}
        <ToggleGroup
          type="single"
          value={previewDevice}
          onValueChange={(v) => v && setPreviewDevice(v as PreviewDevice)}
        >
          {DEVICES.map((d) => (
            <Tooltip key={d.value}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={d.value}
                  aria-label={d.value}
                  className="h-8 px-2"
                >
                  <d.icon className="h-3.5 w-3.5" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent className="capitalize">{d.value}</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
      </TooltipProvider>

      <div className="flex-1" />

      {/* Preview toggle */}
      <Button
        variant={showPreview ? "default" : "outline"}
        size="sm"
        className="h-8"
        onClick={togglePreview}
      >
        {showPreview ? (
          <>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </>
        ) : (
          <>
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
          </>
        )}
      </Button>

      {/* WordPress connector */}
      <Button
        variant={wpConnected ? "default" : "outline"}
        size="sm"
        className="h-8"
        onClick={() => setWpOpen(true)}
      >
        <Plug className="mr-1.5 h-3.5 w-3.5" />
        <span className="hidden sm:inline">WordPress</span>
        {wpConnected ? (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
        ) : null}
      </Button>

      {/* Export menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Download</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => handleExport("html")}>
            Page HTML
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("seo-json")}>
            SEO config (JSON)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleExport("robots")}>
            robots.txt
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("sitemap")}>
            sitemap.xml
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        className="h-8"
        onClick={() => {
          if (confirm("Reset the project to defaults? This clears the canvas.")) {
            resetProject();
            toast.success("Project reset");
          }
        }}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
      </Button>

      <WordPressDialog open={wpOpen} onOpenChange={setWpOpen} />
    </header>
  );
}
