"use client";

import { Settings2, Search, ShieldCheck, Link2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertiesPanel } from "./PropertiesPanel";
import { SeoPanel } from "./SeoPanel";
import { EeatPanel } from "./EeatPanel";
import { InternalLinksPanel } from "./InternalLinksPanel";

export function RightPanel() {
  return (
    <div className="flex h-full flex-col bg-background">
      <Tabs defaultValue="seo" className="flex h-full flex-col">
        <TabsList className="m-2 grid h-9 grid-cols-4">
          <TabsTrigger value="seo" className="gap-1 text-xs">
            <Search className="h-3.5 w-3.5" /> SEO
          </TabsTrigger>
          <TabsTrigger value="eeat" className="gap-1 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" /> E-E-A-T
          </TabsTrigger>
          <TabsTrigger value="links" className="gap-1 text-xs">
            <Link2 className="h-3.5 w-3.5" /> Links
          </TabsTrigger>
          <TabsTrigger value="props" className="gap-1 text-xs">
            <Settings2 className="h-3.5 w-3.5" /> Style
          </TabsTrigger>
        </TabsList>
        <TabsContent value="seo" className="mt-0 min-h-0 flex-1">
          <SeoPanel />
        </TabsContent>
        <TabsContent value="eeat" className="mt-0 min-h-0 flex-1">
          <EeatPanel />
        </TabsContent>
        <TabsContent value="links" className="mt-0 min-h-0 flex-1">
          <InternalLinksPanel />
        </TabsContent>
        <TabsContent value="props" className="mt-0 min-h-0 flex-1">
          <PropertiesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
