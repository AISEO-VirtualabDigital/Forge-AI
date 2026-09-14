"use client";

import * as React from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useBuilder } from "@/lib/store";
import { TopBar } from "@/components/builder/TopBar";
import { LeftPanel } from "@/components/builder/LeftPanel";
import { Canvas } from "@/components/builder/Canvas";
import { RightPanel } from "@/components/builder/RightPanel";
import { HybridPanel } from "@/components/builder/CodeView";
import { CustomCodePanel } from "@/components/builder/CustomCodePanel";
import { Preview } from "@/components/builder/Preview";
import { Footer } from "@/components/builder/Footer";
import { FloatingAssistant } from "@/components/ai/FloatingAssistant";
import { cn } from "@/lib/utils";

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-px bg-border transition-colors hover:bg-primary/40">
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}

export default function Home() {
  const mode = useBuilder((s) => s.mode);
  const showPreview = useBuilder((s) => s.showPreview);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar />

      <main className="flex min-h-0 flex-1">
        {showPreview ? (
          <Preview />
        ) : mode === "code" ? (
          <CustomCodePanel />
        ) : (
          <PanelGroup direction="horizontal" className="min-h-0 flex-1">
            <Panel defaultSize={18} minSize={14} maxSize={28} className="hidden md:block">
              <LeftPanel />
            </Panel>
            <ResizeHandle />
            <Panel defaultSize={52} minSize={30}>
              {mode === "hybrid" ? <HybridPanel /> : <Canvas />}
            </Panel>
            <ResizeHandle />
            <Panel defaultSize={30} minSize={20} maxSize={42}>
              <RightPanel />
            </Panel>
          </PanelGroup>
        )}
      </main>

      <Footer />
      <FloatingAssistant />

      {/* Mobile side-panel toggle hint */}
      <MobileHint />
    </div>
  );
}

function MobileHint() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    setShow(typeof window !== "undefined" && window.innerWidth < 768);
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed bottom-14 left-1/2 z-40 -translate-x-1/2 rounded-full bg-muted/90 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur md:hidden">
      Tip: rotate to landscape for full panels
    </div>
  );
}
