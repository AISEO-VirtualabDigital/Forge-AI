import type { Block, SeoAnalysis, SeoCheck, SeoConfig } from "./types";

// Collect all human-readable text content from the blocks for analysis.
export function extractContentText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const p = b.props;
    switch (b.type) {
      case "nav":
        parts.push(p.brand ?? "");
        (p.links ?? []).forEach((l) => parts.push(l.label));
        break;
      case "hero":
        parts.push(p.badge ?? "", p.text ?? "", p.subtitle ?? "", p.ctaText ?? "");
        break;
      case "heading":
      case "paragraph":
      case "quote":
      case "card":
      case "cta":
        parts.push(p.text ?? "", p.title ?? "", p.subtitle ?? "", p.author ?? "", p.ctaText ?? "");
        break;
      case "features":
        (p.features ?? []).forEach((f) => parts.push(f.title, f.desc));
        break;
      case "image":
        parts.push(p.alt ?? "");
        break;
      case "footer":
        parts.push(p.brand ?? "", p.copyright ?? "");
        (p.links ?? []).forEach((l) => parts.push(l.label));
        break;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

// Rough Flesch reading ease (English approximation).
function fleschReadingEase(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const sentences = Math.max(text.split(/[.!?]+/).filter(Boolean).length, 1);
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences;
  const syllablesPerWord = syllables / words.length;
  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  const groups = word.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (word.endsWith("e")) count = Math.max(count - 1, 1);
  return Math.max(count, 1);
}

export function countHeadings(blocks: Block[]): Record<string, number> {
  const counts: Record<string, number> = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  for (const b of blocks) {
    if (b.type === "heading") {
      const lvl = b.props.level ?? 2;
      counts[`h${lvl}`] = (counts[`h${lvl}`] ?? 0) + 1;
    }
    if (b.type === "hero") {
      // hero headline acts like an h1
    }
  }
  return counts;
}

export function countImages(blocks: Block[]): { total: number; withoutAlt: number } {
  let total = 0;
  let withoutAlt = 0;
  for (const b of blocks) {
    if (b.type === "image") {
      total += 1;
      const alt = (b.props.alt ?? "").trim();
      if (!alt || alt.toLowerCase().startsWith("descriptive alt")) withoutAlt += 1;
    }
  }
  return { total, withoutAlt };
}

export function keywordDensity(text: string, keyword: string): number {
  const k = keyword.trim().toLowerCase();
  if (!k) return 0;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let count = 0;
  const phraseWords = k.split(/\s+/);
  if (phraseWords.length === 1) {
    count = words.filter((w) => w === k).length;
  } else {
    for (let i = 0; i <= words.length - phraseWords.length; i++) {
      if (phraseWords.every((pw, j) => words[i + j] === pw)) count += 1;
    }
  }
  return Math.round((count / words.length) * 1000) / 10;
}

export function analyzeSeo(blocks: Block[], seo: SeoConfig): SeoAnalysis {
  const contentText = extractContentText(blocks);
  const wordCount = countWords(contentText);
  const headingCounts = countHeadings(blocks);
  const images = countImages(blocks);
  const density = keywordDensity(contentText, seo.focusKeyword);
  const readability = fleschReadingEase(contentText);
  const titleLength = seo.title.length;
  const descriptionLength = seo.description.length;

  const checks: SeoCheck[] = [];

  checks.push({
    id: "title-length",
    label: "Title length (30–60 chars)",
    status:
      titleLength === 0
        ? "fail"
        : titleLength < 30
        ? "warn"
        : titleLength <= 60
        ? "pass"
        : "warn",
    detail:
      titleLength === 0
        ? "No title set."
        : `${titleLength} characters. Keep between 30 and 60.`,
    weight: 12,
  });

  checks.push({
    id: "description-length",
    label: "Meta description (70–160 chars)",
    status:
      descriptionLength === 0
        ? "fail"
        : descriptionLength < 70
        ? "warn"
        : descriptionLength <= 160
        ? "pass"
        : "warn",
    detail:
      descriptionLength === 0
        ? "No description set."
        : `${descriptionLength} characters.`,
    weight: 10,
  });

  checks.push({
    id: "focus-keyword",
    label: "Focus keyword set",
    status: seo.focusKeyword.trim() ? "pass" : "fail",
    detail: seo.focusKeyword
      ? `Tracking "${seo.focusKeyword}".`
      : "No focus keyword defined.",
    weight: 8,
  });

  const focusInTitle = seo.focusKeyword
    ? seo.title.toLowerCase().includes(seo.focusKeyword.toLowerCase())
    : false;
  checks.push({
    id: "keyword-in-title",
    label: "Focus keyword in title",
    status: !seo.focusKeyword ? "warn" : focusInTitle ? "pass" : "fail",
    detail: focusInTitle
      ? "Found in the page title."
      : "Add the focus keyword to your title.",
    weight: 9,
  });

  const focusInContent = seo.focusKeyword
    ? contentText.toLowerCase().includes(seo.focusKeyword.toLowerCase())
    : false;
  checks.push({
    id: "keyword-in-content",
    label: "Focus keyword in content",
    status: !seo.focusKeyword ? "warn" : focusInContent ? "pass" : "fail",
    detail: focusInContent ? "Present in page content." : "Not found in content.",
    weight: 8,
  });

  checks.push({
    id: "keyword-density",
    label: "Keyword density (0.5–2.5%)",
    status:
      !seo.focusKeyword
        ? "warn"
        : density >= 0.5 && density <= 2.5
        ? "pass"
        : density > 2.5
        ? "warn"
        : "warn",
    detail: !seo.focusKeyword
      ? "Set a focus keyword first."
      : `${density}% density.`,
    weight: 7,
  });

  checks.push({
    id: "h1",
    label: "Exactly one H1",
    status:
      headingCounts.h1 === 1
        ? "pass"
        : headingCounts.h1 === 0
        ? "warn"
        : "fail",
    detail:
      headingCounts.h1 === 1
        ? "One H1 detected."
        : headingCounts.h1 === 0
        ? "No H1 heading. Add a Heading with level 1."
        : `${headingCounts.h1} H1 headings. Use only one.`,
    weight: 9,
  });

  checks.push({
    id: "heading-structure",
    label: "Uses subheadings (H2/H3)",
    status: headingCounts.h2 + headingCounts.h3 > 0 ? "pass" : "warn",
    detail:
      headingCounts.h2 + headingCounts.h3 > 0
        ? `${headingCounts.h2} H2, ${headingCounts.h3} H3.`
        : "Add subheadings to structure content.",
    weight: 6,
  });

  checks.push({
    id: "word-count",
    label: "Content length (≥300 words)",
    status: wordCount >= 300 ? "pass" : wordCount >= 150 ? "warn" : "fail",
    detail: `${wordCount} words on the page.`,
    weight: 8,
  });

  checks.push({
    id: "images-alt",
    label: "Images have alt text",
    status:
      images.total === 0
        ? "pass"
        : images.withoutAlt === 0
        ? "pass"
        : images.withoutAlt === images.total
        ? "fail"
        : "warn",
    detail:
      images.total === 0
        ? "No images on the page."
        : `${images.total - images.withoutAlt}/${images.total} images have alt text.`,
    weight: 7,
  });

  checks.push({
    id: "og-tags",
    label: "Open Graph tags",
    status:
      seo.ogTitle && seo.ogDescription && seo.ogImage
        ? "pass"
        : !seo.ogTitle && !seo.ogDescription
        ? "warn"
        : "warn",
    detail:
      seo.ogTitle && seo.ogDescription && seo.ogImage
        ? "OG title, description and image set."
        : "Complete OG title, description and image for social sharing.",
    weight: 6,
  });

  checks.push({
    id: "twitter-card",
    label: "Twitter card",
    status: seo.twitterCard ? "pass" : "warn",
    detail: `Card type: ${seo.twitterCard}.`,
    weight: 3,
  });

  checks.push({
    id: "canonical",
    label: "Canonical URL",
    status: seo.canonical ? "pass" : "warn",
    detail: seo.canonical ? seo.canonical : "No canonical URL set.",
    weight: 4,
  });

  checks.push({
    id: "jsonld",
    label: "Schema.org structured data",
    status: seo.jsonLd.trim() ? "pass" : "warn",
    detail: seo.jsonLd.trim() ? "JSON-LD present." : "Add JSON-LD for rich results.",
    weight: 5,
  });

  checks.push({
    id: "robots",
    label: "Robots meta",
    status: /noindex/i.test(seo.robots) ? "warn" : "pass",
    detail: /noindex/i.test(seo.robots)
      ? "noindex detected — page won't be indexed."
      : `robots: ${seo.robots || "index, follow"}`,
    weight: 3,
  });

  checks.push({
    id: "readability",
    label: "Readability (Flesch)",
    status: readability >= 60 ? "pass" : readability >= 30 ? "warn" : "fail",
    detail: `Flesch score ${readability}.`,
    weight: 5,
  });

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => {
    if (c.status === "pass") return s + c.weight;
    if (c.status === "warn") return s + c.weight * 0.5;
    return s;
  }, 0);
  const score = Math.round((earned / totalWeight) * 100);

  return {
    score,
    checks,
    wordCount,
    headingCounts,
    keywordDensity: density,
    readability,
    imagesWithoutAlt: images.withoutAlt,
    totalImages: images.total,
    titleLength,
    descriptionLength,
    contentText,
  };
}

export const DEFAULT_SEO: SeoConfig = {
  title: "Forge — Build & Ship Beautiful Websites Fast",
  description:
    "Forge is a lightweight, AI-powered website builder with drag & drop, hybrid editing and a full SEO toolkit.",
  keywords: "website builder, drag and drop, seo, ai builder, landing page",
  focusKeyword: "website builder",
  canonical: "https://example.com",
  robots: "index, follow",
  ogTitle: "Forge — Build Beautiful Websites Fast",
  ogDescription:
    "Lightweight, AI-powered website builder with drag & drop and full SEO toolkit.",
  ogImage: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80",
  ogType: "website",
  twitterCard: "summary_large_image",
  twitterSite: "@forge",
  jsonLd: JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Forge",
      url: "https://example.com",
    },
    null,
    2,
  ),
  author: "Forge Team",
  lang: "en",
};

// Build the robots.txt content from config (for preview/export).
export function buildRobotsTxt(seo: SeoConfig): string {
  const noindex = /noindex/i.test(seo.robots);
  return `User-agent: *
${noindex ? "Disallow: /" : "Allow: /"}
Sitemap: ${seo.canonical || "https://example.com"}/sitemap.xml
`;
}

// Build a sitemap.xml preview from config.
export function buildSitemapXml(seo: SeoConfig): string {
  const url = (seo.canonical || "https://example.com").replace(/\/$/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
}
