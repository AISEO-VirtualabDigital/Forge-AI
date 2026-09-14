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

// ---------------------------------------------------------------------------
// E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)
// ---------------------------------------------------------------------------

export type EeatDimension = "experience" | "expertise" | "authoritativeness" | "trustworthiness";

export interface EeatCheck {
  id: string;
  dimension: EeatDimension;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  weight: number;
}

export interface EeatAnalysis {
  score: number; // 0-100 overall
  dimensions: Record<
    EeatDimension,
    { score: number; label: string; description: string }
  >;
  checks: EeatCheck[];
  contentText: string;
  signals: {
    hasAuthorBio: boolean;
    hasContactInfo: boolean;
    hasAboutMention: boolean;
    hasFirstPerson: boolean;
    hasCitations: boolean;
    hasHttps: boolean;
    hasSchema: boolean;
    hasDates: boolean;
    hasDisclaimers: boolean;
    hasExternalLinks: boolean;
    firstPersonCount: number;
    citationCount: number;
    contentDepthScore: number; // 0-100
  };
}

// ---------------------------------------------------------------------------
// Internal Linking
// ---------------------------------------------------------------------------

export interface InternalLinkSuggestion {
  id: string;
  anchorText: string; // the text to turn into a link
  suggestedTarget: string; // URL or #anchor
  reason: string; // why this is a good internal link
  blockId?: string; // which block contains the anchor (if known)
  applied?: boolean;
}

export interface InternalLinkAnalysis {
  existingLinks: { text: string; href: string; blockId: string }[];
  suggestions: InternalLinkSuggestion[];
  anchorDistribution: Record<string, number>;
  totalLinks: number;
}

// ---------------------------------------------------------------------------
// WordPress connector
// ---------------------------------------------------------------------------

export interface WordPressConfig {
  siteUrl: string; // e.g. https://my-site.com (no trailing slash)
  username: string;
  appPassword: string; // WordPress Application Password
}

export interface WordPressPost {
  id: number;
  title: string;
  status: string;
  slug: string;
  link: string;
  date: string;
  modified: string;
}

export interface WordPressConnectionState {
  connected: boolean;
  siteName?: string;
  lastChecked?: number;
  error?: string;
}
