"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
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
import { OrchestrationDashboard } from "@/components/dashboard/OrchestrationDashboard";

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-px bg-border transition-colors hover:bg-primary/40">
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}

/**
 * SSR-safe skeleton rendered until the client has mounted AND the persisted
 * zustand store has rehydrated from localStorage. Without this gate the
 * server renders with default state (default blocks, default SEO) while the
 * client renders with persisted state — causing two hydration mismatches:
 *   1. dnd-kit's auto-incremented aria-describedby IDs differ between
 *      server and client renders.
 *   2. Dynamic derived values (e.g. the EEAT score in the Footer) differ
 *      because they depend on persisted state.
 * Rendering a stable skeleton during SSR/pre-mount eliminates both.
 */
function BuilderSkeleton() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <div className="h-7 w-7 animate-pulse rounded-md bg-primary" />
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="ml-2 h-6 w-px bg-border" />
        <div className="h-6 w-28 animate-pulse rounded bg-muted" />
        <div className="flex-1" />
        <div className="h-6 w-20 animate-pulse rounded bg-muted" />
        <div className="h-6 w-20 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Forge builder…
        </div>
      </div>
      <div className="h-8 shrink-0 border-t" />
    </div>
  );
}

export default function Home() {
  // `mounted` flips to true on the client after the first paint. Until then
  // we render the skeleton, which is identical on server and client → no
  // hydration mismatch. The persisted store rehydrates synchronously inside
  // zustand persist's useEffect before our own effect runs, so by the time
  // we swap to the full app, all dynamic values are stable.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const mode = useBuilder((s) => s.mode);
  const showPreview = useBuilder((s) => s.showPreview);
  const activeView = useBuilder((s) => s.activeView);

  if (!mounted) {
    return <BuilderSkeleton />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar />

      <main className="flex min-h-0 flex-1">
        {activeView === "dashboard" ? (
          <OrchestrationDashboard />
        ) : showPreview ? (
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
