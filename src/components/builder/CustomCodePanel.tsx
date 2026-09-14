"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { CodeEditor } from "./CodeView";
import { Button } from "@/components/ui/button";
import { Eye, Code2 } from "lucide-react";

// Full-screen editable HTML editor with a live preview toggle.
export function CustomCodePanel() {
  const customCode = useBuilder((s) => s.customCode);
  const setCustomCode = useBuilder((s) => s.setCustomCode);
  const seo = useBuilder((s) => s.seo);
  const [showPreview, setShowPreview] = React.useState(false);

  const doc = React.useMemo(
    () =>
      `<!DOCTYPE html>
<html lang="${seo.lang || "en"}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-slate-900 antialiased">
${customCode}
</body>
</html>`,
    [customCode, seo.lang],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b bg-background px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          Write HTML below. Tailwind CSS is loaded automatically.
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? (
            <>
              <Code2 className="mr-1.5 h-3.5 w-3.5" /> Edit code
            </>
          ) : (
            <>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Live preview
            </>
          )}
        </Button>
      </div>
      {showPreview ? (
        <iframe
          title="Custom code preview"
          srcDoc={doc}
          className="min-h-0 flex-1 border-0 bg-white"
          sandbox="allow-scripts"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeEditor value={customCode} onChange={setCustomCode} />
        </div>
      )}
    </div>
  );
}
