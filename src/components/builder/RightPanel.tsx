"use client";

import { Settings2, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertiesPanel } from "./PropertiesPanel";
import { SeoPanel } from "./SeoPanel";

export function RightPanel() {
  return (
    <div className="flex h-full flex-col bg-background">
      <Tabs defaultValue="seo" className="flex h-full flex-col">
        <TabsList className="m-2 grid h-9 grid-cols-2">
          <TabsTrigger value="seo" className="gap-1.5 text-xs">
            <Search className="h-3.5 w-3.5" /> SEO Tools
          </TabsTrigger>
          <TabsTrigger value="props" className="gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" /> Properties
          </TabsTrigger>
        </TabsList>
        <TabsContent value="seo" className="mt-0 min-h-0 flex-1">
          <SeoPanel />
        </TabsContent>
        <TabsContent value="props" className="mt-0 min-h-0 flex-1">
          <PropertiesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
