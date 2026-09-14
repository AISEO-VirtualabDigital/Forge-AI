"use client";

import * as React from "react";
import { Trash2, Plus, X } from "lucide-react";
import { useBuilder } from "@/lib/store";
import { getBlockDefinition } from "@/lib/blocks";
import type { Block } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PropsEditor({ block }: { block: Block }) {
  const update = useBuilder((s) => s.updateBlockProps);
  const p = block.props;
  const set = (patch: Partial<Block["props"]>) => update(block.id, patch);

  const textInput = (label: string, key: keyof Block["props"]) => (
    <Field label={label}>
      <Input
        value={String(p[key] ?? "")}
        onChange={(e) => set({ [key]: e.target.value } as object)}
        className="h-8 text-xs"
      />
    </Field>
  );

  const areaInput = (label: string, key: keyof Block["props"]) => (
    <Field label={label}>
      <Textarea
        value={String(p[key] ?? "")}
        onChange={(e) => set({ [key]: e.target.value } as object)}
        className="text-xs"
        rows={3}
      />
    </Field>
  );

  switch (block.type) {
    case "nav":
      return (
        <div className="space-y-3">
          {textInput("Brand", "brand")}
          <Field label="Links">
            <div className="space-y-1.5">
              {(p.links ?? []).map((l, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={l.label}
                    onChange={(e) => {
                      const links = [...(p.links ?? [])];
                      links[i] = { ...links[i], label: e.target.value };
                      set({ links });
                    }}
                    className="h-7 text-xs"
                    placeholder="Label"
                  />
                  <Input
                    value={l.href}
                    onChange={(e) => {
                      const links = [...(p.links ?? [])];
                      links[i] = { ...links[i], href: e.target.value };
                      set({ links });
                    }}
                    className="h-7 text-xs"
                    placeholder="URL"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() =>
                      set({ links: (p.links ?? []).filter((_, j) => j !== i) })
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() =>
                  set({
                    links: [...(p.links ?? []), { label: "Link", href: "#" }],
                  })
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Add link
              </Button>
            </div>
          </Field>
        </div>
      );

    case "hero":
      return (
        <div className="space-y-3">
          {textInput("Badge", "badge")}
          {textInput("Headline", "text")}
          {areaInput("Subtitle", "subtitle")}
          {textInput("Button text", "ctaText")}
          {textInput("Button link", "ctaHref")}
        </div>
      );

    case "heading":
      return (
        <div className="space-y-3">
          {textInput("Text", "text")}
          <Field label="Level">
            <Select
              value={String(p.level ?? 2)}
              onValueChange={(v) => set({ level: Number(v) as Block["props"]["level"] })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((l) => (
                  <SelectItem key={l} value={String(l)}>
                    H{l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "paragraph":
      return <div className="space-y-3">{areaInput("Text", "text")}</div>;

    case "button":
      return (
        <div className="space-y-3">
          {textInput("Text", "text")}
          {textInput("Link", "href")}
          <Field label="Variant">
            <Select
              value={String(p.variant ?? "primary")}
              onValueChange={(v) => set({ variant: v as Block["props"]["variant"] })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["primary", "secondary", "outline", "ghost"].map((v) => (
                  <SelectItem key={v} value={v} className="capitalize">
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          {textInput("Image URL", "src")}
          {textInput("Alt text (important for SEO)", "alt")}
        </div>
      );

    case "card":
      return (
        <div className="space-y-3">
          {textInput("Title", "title")}
          {areaInput("Text", "text")}
        </div>
      );

    case "features":
      return (
        <Field label="Features">
          <div className="space-y-2">
            {(p.features ?? []).map((f, i) => (
              <div key={i} className="rounded-md border p-2">
                <Input
                  value={f.title}
                  onChange={(e) => {
                    const features = [...(p.features ?? [])];
                    features[i] = { ...features[i], title: e.target.value };
                    set({ features });
                  }}
                  className="mb-1 h-7 text-xs"
                  placeholder="Title"
                />
                <Input
                  value={f.desc}
                  onChange={(e) => {
                    const features = [...(p.features ?? [])];
                    features[i] = { ...features[i], desc: e.target.value };
                    set({ features });
                  }}
                  className="h-7 text-xs"
                  placeholder="Description"
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() =>
                set({
                  features: [
                    ...(p.features ?? []),
                    { title: "New feature", desc: "Description" },
                  ],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Add feature
            </Button>
          </div>
        </Field>
      );

    case "quote":
      return (
        <div className="space-y-3">
          {areaInput("Quote", "text")}
          {textInput("Author", "author")}
        </div>
      );

    case "cta":
      return (
        <div className="space-y-3">
          {textInput("Headline", "text")}
          {textInput("Button text", "ctaText")}
          {textInput("Button link", "ctaHref")}
        </div>
      );

    case "footer":
      return (
        <div className="space-y-3">
          {textInput("Brand", "brand")}
          {textInput("Copyright", "copyright")}
          <Field label="Links">
            <div className="space-y-1.5">
              {(p.links ?? []).map((l, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={l.label}
                    onChange={(e) => {
                      const links = [...(p.links ?? [])];
                      links[i] = { ...links[i], label: e.target.value };
                      set({ links });
                    }}
                    className="h-7 text-xs"
                  />
                  <Input
                    value={l.href}
                    onChange={(e) => {
                      const links = [...(p.links ?? [])];
                      links[i] = { ...links[i], href: e.target.value };
                      set({ links });
                    }}
                    className="h-7 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() =>
                      set({ links: (p.links ?? []).filter((_, j) => j !== i) })
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() =>
                  set({ links: [...(p.links ?? []), { label: "Link", href: "#" }] })
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Add link
              </Button>
            </div>
          </Field>
        </div>
      );

    default:
      return (
        <p className="text-xs text-muted-foreground">
          This block has no editable properties.
        </p>
      );
  }
}

function StyleEditor({ block }: { block: Block }) {
  const update = useBuilder((s) => s.updateBlockStyle);
  const s = block.style;
  const set = (patch: Partial<Block["style"]>) => update(block.id, patch);

  return (
    <div className="space-y-3">
      <Field label="Alignment">
        <Select
          value={s.align ?? "left"}
          onValueChange={(v) => set({ align: v as Block["style"]["align"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Background (Tailwind class)">
        <Input
          value={s.background ?? ""}
          onChange={(e) => set({ background: e.target.value })}
          placeholder="e.g. bg-muted"
          className="h-8 text-xs"
        />
      </Field>
      <Field label="Padding (Tailwind class)">
        <Input
          value={s.padding ?? ""}
          onChange={(e) => set({ padding: e.target.value })}
          placeholder="e.g. py-12 px-6"
          className="h-8 text-xs"
        />
      </Field>
      <Field label="Rounded (Tailwind class)">
        <Input
          value={s.rounded ?? ""}
          onChange={(e) => set({ rounded: e.target.value })}
          placeholder="e.g. rounded-xl"
          className="h-8 text-xs"
        />
      </Field>
      <Field label="Extra classes">
        <Input
          value={s.extraClass ?? ""}
          onChange={(e) => set({ extraClass: e.target.value })}
          placeholder="e.g. border shadow-sm"
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}

export function PropertiesPanel() {
  const selectedId = useBuilder((s) => s.selectedId);
  const blocks = useBuilder((s) => s.blocks);
  const removeBlock = useBuilder((s) => s.removeBlock);
  const select = useBuilder((s) => s.select);
  const block = blocks.find((b) => b.id === selectedId) ?? null;

  if (!block) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a block on the canvas to edit its content and style.
        </p>
      </div>
    );
  }

  const def = getBlockDefinition(block.type);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{def?.label ?? block.type}</h3>
            <p className="text-[10px] text-muted-foreground">
              {def?.description}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => {
              removeBlock(block.id);
              select(null);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Separator />
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Content
          </h4>
          <PropsEditor block={block} />
        </div>
        <Separator />
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Style
          </h4>
          <StyleEditor block={block} />
        </div>
      </div>
    </ScrollArea>
  );
}
