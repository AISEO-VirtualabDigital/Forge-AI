// Core type definitions for the Forge website builder.

export type EditMode = "dragdrop" | "hybrid" | "code";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export type BlockType =
  | "nav"
  | "hero"
  | "heading"
  | "paragraph"
  | "button"
  | "image"
  | "card"
  | "features"
  | "quote"
  | "cta"
  | "divider"
  | "spacer"
  | "footer";

export interface BlockStyle {
  align?: "left" | "center" | "right";
  color?: string;
  background?: string;
  fontSize?: string;
  padding?: string;
  rounded?: string;
  extraClass?: string;
}

export interface BlockProps {
  // text
  text?: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  // image
  src?: string;
  alt?: string;
  // button / link
  href?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  // card / features
  title?: string;
  subtitle?: string;
  features?: { title: string; desc: string; icon?: string }[];
  // hero
  badge?: string;
  ctaText?: string;
  ctaHref?: string;
  // nav
  brand?: string;
  links?: { label: string; href: string }[];
  // quote
  author?: string;
  // footer
  copyright?: string;
  // generic
  [key: string]: unknown;
}

export interface Block {
  id: string;
  type: BlockType;
  props: BlockProps;
  style: BlockStyle;
}

export interface SeoConfig {
  title: string;
  description: string;
  keywords: string;
  focusKeyword: string;
  canonical: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  twitterCard: "summary" | "summary_large_image";
  twitterSite: string;
  jsonLd: string;
  author: string;
  lang: string;
}

export interface SeoCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  weight: number;
}

export interface SeoAnalysis {
  score: number;
  checks: SeoCheck[];
  wordCount: number;
  headingCounts: Record<string, number>;
  keywordDensity: number;
  readability: number;
  imagesWithoutAlt: number;
  totalImages: number;
  titleLength: number;
  descriptionLength: number;
  contentText: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}
