"use client";

import * as React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, RefreshCw } from "lucide-react";
import { useBuilder } from "@/lib/store";
import { blocksToHtml } from "@/lib/ai-context";
import { Canvas } from "./Canvas";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        toast.success("Copied to clipboard");
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

// Read-only syntax-highlighted code view (used in Hybrid mode + preview).
export function CodeView({
  code,
  language = "markup",
  title,
}: {
  code: string;
  language?: string;
  title?: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#282c34]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-300">
          {title ?? "HTML"}
        </span>
        <CopyButton text={code} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            background: "transparent",
            fontSize: "12px",
            padding: "12px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineHeight: 1.6,
            minHeight: "100%",
          }}
          codeTagProps={{
            style: {
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
          }}
          wrapLongLines
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// Editable code editor (used in Custom Code mode). Uses a textarea overlay
// on top of a syntax highlighter for live highlighting.
export function CodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  return (
    <div className="relative h-full overflow-hidden bg-[#282c34]">
      <div className="absolute inset-0 overflow-auto">
        <SyntaxHighlighter
          language="markup"
          style={oneDark}
          customStyle={{
            margin: 0,
            background: "transparent",
            fontSize: "13px",
            padding: "12px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineHeight: 1.6,
            minHeight: "100%",
          }}
          codeTagProps={{
            style: {
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
          }}
          wrapLongLines
        >
          {value + "\n"}
        </SyntaxHighlighter>
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="absolute inset-0 resize-none bg-transparent font-mono text-transparent caret-white"
        style={{
          fontSize: "13px",
          padding: "12px",
          lineHeight: 1.6,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        }}
      />
    </div>
  );
}

// Hybrid panel: canvas visual (top) + live generated code (bottom).
export function HybridPanel() {
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const html = React.useMemo(() => blocksToHtml(blocks, seo), [blocks, seo]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <Canvas />
      </div>
      <div className="h-2 shrink-0 bg-border" />
      <div className="h-[40%] min-h-[180px] shrink-0">
        <CodeView code={html} title="Generated HTML (live)" />
      </div>
    </div>
  );
}
