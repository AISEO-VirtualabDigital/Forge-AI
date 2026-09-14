import type { Block, BlockType } from "./types";

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string; // lucide icon name
  category: "layout" | "content" | "media" | "marketing";
  description: string;
  defaultProps: Block["props"];
  defaultStyle: Block["style"];
}

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  {
    type: "nav",
    label: "Navbar",
    icon: "PanelTop",
    category: "layout",
    description: "Site navigation with brand and links",
    defaultProps: {
      brand: "Forge",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
        { label: "About", href: "#about" },
      ],
    },
    defaultStyle: { align: "left", extraClass: "border-b" },
  },
  {
    type: "hero",
    label: "Hero",
    icon: "Sparkles",
    category: "marketing",
    description: "Large headline section with CTA",
    defaultProps: {
      badge: "New",
      text: "Build beautiful websites at lightning speed",
      subtitle:
        "A lightweight, AI-assisted builder with drag & drop, hybrid editing, and full SEO toolkit.",
      ctaText: "Get Started",
      ctaHref: "#",
    },
    defaultStyle: {
      align: "center",
      background: "bg-muted",
      padding: "py-20 px-6",
      extraClass: "",
    },
  },
  {
    type: "heading",
    label: "Heading",
    icon: "Heading",
    category: "content",
    description: "Section title (H1-H6)",
    defaultProps: { text: "Section heading", level: 2 },
    defaultStyle: { align: "left", padding: "py-3" },
  },
  {
    type: "paragraph",
    label: "Paragraph",
    icon: "AlignLeft",
    category: "content",
    description: "Body text block",
    defaultProps: {
      text: "Write engaging copy here. Keep sentences short and clear so both readers and search engines understand your message quickly.",
    },
    defaultStyle: { align: "left", padding: "py-2" },
  },
  {
    type: "button",
    label: "Button",
    icon: "MousePointerClick",
    category: "content",
    description: "Call-to-action button",
    defaultProps: { text: "Click me", href: "#", variant: "primary" },
    defaultStyle: { align: "left", padding: "py-2" },
  },
  {
    type: "image",
    label: "Image",
    icon: "Image",
    category: "media",
    description: "Responsive image with alt text",
    defaultProps: {
      src: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80",
      alt: "Descriptive alt text for SEO",
    },
    defaultStyle: { align: "center", rounded: "rounded-xl", padding: "py-2" },
  },
  {
    type: "card",
    label: "Card",
    icon: "RectangleHorizontal",
    category: "layout",
    description: "Bordered content card",
    defaultProps: {
      title: "Card title",
      text: "Supporting description for the card content goes here.",
    },
    defaultStyle: {
      background: "bg-card",
      rounded: "rounded-xl",
      padding: "p-6",
      extraClass: "border shadow-sm",
    },
  },
  {
    type: "features",
    label: "Features",
    icon: "LayoutGrid",
    category: "marketing",
    description: "Grid of feature highlights",
    defaultProps: {
      features: [
        { title: "Fast", desc: "Lightning quick builds" },
        { title: "SEO-ready", desc: "Optimized out of the box" },
        { title: "AI-powered", desc: "Generate with prompts" },
      ],
    },
    defaultStyle: { align: "center", padding: "py-12 px-6" },
  },
  {
    type: "quote",
    label: "Quote",
    icon: "Quote",
    category: "content",
    description: "Blockquote with attribution",
    defaultProps: {
      text: "This is the fastest way to ship a landing page I have ever used.",
      author: "Happy Customer",
    },
    defaultStyle: { align: "left", padding: "py-6" },
  },
  {
    type: "cta",
    label: "CTA Band",
    icon: "Megaphone",
    category: "marketing",
    description: "Full-width call to action",
    defaultProps: {
      text: "Ready to launch your site?",
      ctaText: "Start now",
      ctaHref: "#",
    },
    defaultStyle: {
      align: "center",
      background: "bg-primary text-primary-foreground",
      rounded: "rounded-2xl",
      padding: "p-10",
    },
  },
  {
    type: "divider",
    label: "Divider",
    icon: "Minus",
    category: "layout",
    description: "Horizontal separator",
    defaultProps: {},
    defaultStyle: { padding: "py-4" },
  },
  {
    type: "spacer",
    label: "Spacer",
    icon: "MoveVertical",
    category: "layout",
    description: "Vertical whitespace",
    defaultProps: {},
    defaultStyle: { padding: "py-8" },
  },
  {
    type: "footer",
    label: "Footer",
    icon: "PanelBottom",
    category: "layout",
    description: "Page footer with copyright",
    defaultProps: {
      brand: "Forge",
      copyright: "All rights reserved.",
      links: [
        { label: "Privacy", href: "#" },
        { label: "Terms", href: "#" },
      ],
    },
    defaultStyle: {
      align: "left",
      background: "bg-muted",
      padding: "py-8 px-6",
      extraClass: "border-t",
    },
  },
];

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return BLOCK_DEFINITIONS.find((b) => b.type === type);
}

export function createBlock(type: BlockType): Block {
  const def = getBlockDefinition(type);
  return {
    id: `b_${Math.random().toString(36).slice(2, 10)}`,
    type,
    props: def ? structuredClone(def.defaultProps) : {},
    style: def ? structuredClone(def.defaultStyle) : {},
  };
}

// A sensible default starter page so the canvas is never empty.
export function defaultBlocks(): Block[] {
  return [
    createBlock("nav"),
    createBlock("hero"),
    createBlock("features"),
    createBlock("cta"),
    createBlock("footer"),
  ];
}
