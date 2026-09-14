"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { BlockRenderer } from "./BlockRenderer";
import { cn } from "@/lib/utils";

// Clean, toolbar-free render of the page. Used when the user hits "Preview".
export function Preview() {
  const blocks = useBuilder((s) => s.blocks);
  const seo = useBuilder((s) => s.seo);
  const customCode = useBuilder((s) => s.customCode);
  const mode = useBuilder((s) => s.mode);
  const previewDevice = useBuilder((s) => s.previewDevice);

  const widthClass =
    previewDevice === "mobile"
      ? "max-w-[390px]"
      : previewDevice === "tablet"
      ? "max-w-[820px]"
      : "max-w-full";

  if (mode === "code") {
    const doc = `<!DOCTYPE html><html lang="${seo.lang || "en"}"><head><meta charset="UTF-8"/><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-white text-slate-900 antialiased">${customCode}</body></html>`;
    return (
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-muted/30 p-4 md:p-8">
        <div className={cn("w-full", widthClass)}>
          <iframe
            title="Preview"
            srcDoc={doc}
            className="h-[80vh] w-full rounded-xl border bg-white"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    );
  }

  // Visual modes: render blocks directly (no toolbars).
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-muted/30 p-4 md:p-8">
      <div className={cn("w-full", widthClass)}>
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          {blocks.map((b) => (
            <div key={b.id} className="border-b border-border/40 last:border-0">
              <BlockRenderer block={b} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
