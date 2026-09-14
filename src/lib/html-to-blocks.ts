// Heuristic HTML → Block[] converter.
//
// WordPress REST API returns post content as `content.rendered` — a single
// HTML string. To make it editable in the Forge drag-drop canvas we parse it
// into our Block[] shape. This is intentionally a pragmatic, deterministic
// parser (no AI, instant) that handles the common WP patterns:
//
//   - Gutenberg block comments (<!-- wp:paragraph -->) → stripped, used as hints
//   - <h1>–<h6>   → heading block (with matching level)
//   - <p>          → paragraph block (img inside promoted to its own image block)
//   - <img>        → image block
//   - <figure>     → image block (with figcaption as alt)
//   - <blockquote> → quote block
//   - <ul>/<ol>    → features block (3+ items) or paragraph (1-2 items)
//   - <hr>         → divider block
//   - <nav>        → nav block (brand + links)
//   - <header>     → hero block (best-effort: headline + subtext)
//   - <a> wrapping → button block if it looks like a CTA (single link in a p)
//
// Anything we can't map lands as a paragraph block with the raw HTML escaped,
// so no content is ever lost. Users can then run AI cleanup or edit manually.

import type { Block, BlockType } from "@/lib/types";
import { createBlock } from "@/lib/blocks";

function stripGutenbergComments(html: string): string {
  return html.replace(/<!--\s*\/?wp:[a-z/-]+\s*(?:\{[^}]*\})?\s*-->/gi, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;|&#8212;/g, "—");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "").trim());
}

function getAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = tag.match(re);
  return m ? decodeEntities(m[1]) : null;
}

interface RawElement {
  tag: string; // lowercase tag name, or "text"
  html: string; // the full match including tags
  inner: string; // inner HTML
}

/**
 * Split an HTML string into top-level elements. Handles nested tags by
 * tracking depth. Returns elements in document order.
 */
function splitTopLevel(html: string): RawElement[] {
  const elements: RawElement[] = [];
  const voidTags = new Set([
    "img", "hr", "br", "input", "meta", "link", "source",
  ]);

  let i = 0;
  while (i < html.length) {
    // skip whitespace
    if (/\s/.test(html[i])) {
      i++;
      continue;
    }
    if (html[i] !== "<") {
      // text node outside any tag — collect until next <
      const end = html.indexOf("<", i);
      const text = html.slice(i, end === -1 ? undefined : end);
      i = end === -1 ? html.length : end;
      const cleaned = stripTags(text).trim();
      if (cleaned) elements.push({ tag: "text", html: text, inner: text });
      continue;
    }

    // tag
    const tagEnd = html.indexOf(">", i);
    if (tagEnd === -1) break;
    const openTag = html.slice(i, tagEnd + 1);
    const tagNameMatch = openTag.match(/^<\s*([a-zA-Z0-9]+)/);
    if (!tagNameMatch) {
      i = tagEnd + 1;
      continue;
    }
    const tag = tagNameMatch[1].toLowerCase();
    i = tagEnd + 1;

    if (voidTags.has(tag) || openTag.endsWith("/>")) {
      elements.push({ tag, html: openTag, inner: "" });
      continue;
    }

    // find matching close tag at depth 0
    const closeTag = `</${tag}>`;
    const openRe = new RegExp(`<\\s*${tag}\\b[^>]*>`, "gi");
    let depth = 1;
    let pos = i;
    while (depth > 0 && pos < html.length) {
      openRe.lastIndex = pos;
      const nextOpen = openRe.exec(html);
      const nextClose = html.indexOf(closeTag, pos);
      if (nextClose === -1) {
        // malformed — take the rest
        const inner = html.slice(i);
        elements.push({ tag, html: openTag + inner, inner });
        i = html.length;
        break;
      }
      if (nextOpen && nextOpen.index !== undefined && nextOpen.index < nextClose) {
        depth++;
        pos = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        if (depth === 0) {
          const inner = html.slice(i, nextClose);
          elements.push({
            tag,
            html: openTag + inner + closeTag,
            inner,
          });
          i = nextClose + closeTag.length;
          break;
        }
        pos = nextClose + closeTag.length;
      }
    }
  }
  return elements;
}

function extractFirstImg(html: string): { src: string; alt: string } | null {
  const m = html.match(/<img\b[^>]*>/i);
  if (!m) return null;
  const src = getAttr(m[0], "src") || "";
  const alt = getAttr(m[0], "alt") || "";
  return src ? { src, alt } : null;
}

function extractLinks(html: string): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = getAttr(m[1], "href") || "#";
    const label = stripTags(m[2]) || "link";
    links.push({ label, href });
  }
  return links;
}

function mapElementToBlock(el: RawElement): Block | Block[] | null {
  switch (el.tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(el.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      const text = stripTags(el.inner);
      if (!text) return null;
      const b = createBlock("heading");
      b.props = { text, level };
      b.style = { align: "left", padding: "py-3" };
      return b;
    }

    case "p": {
      const text = stripTags(el.inner);
      const img = extractFirstImg(el.inner);
      // If the paragraph is basically just an image, emit an image block.
      if (img && (!text || text.length < 10)) {
        const b = createBlock("image");
        b.props = { src: img.src, alt: img.alt };
        b.style = { align: "center", rounded: "rounded-xl", padding: "py-2" };
        return b;
      }
      // Single link that looks like a CTA → button.
      const links = extractLinks(el.inner);
      if (links.length === 1 && text === links[0].label) {
        const b = createBlock("button");
        b.props = { text: links[0].label, href: links[0].href, variant: "primary" };
        b.style = { align: "left", padding: "py-2" };
        return b;
      }
      if (!text) return null;
      const b = createBlock("paragraph");
      b.props = { text };
      b.style = { align: "left", padding: "py-2" };
      return b;
    }

    case "img": {
      const src = getAttr(el.html, "src") || "";
      const alt = getAttr(el.html, "alt") || "";
      if (!src) return null;
      const b = createBlock("image");
      b.props = { src, alt };
      b.style = { align: "center", rounded: "rounded-xl", padding: "py-2" };
      return b;
    }

    case "figure": {
      const img = extractFirstImg(el.inner);
      const figcap = el.inner.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
      if (img) {
        const b = createBlock("image");
        b.props = { src: img.src, alt: figcap ? stripTags(figcap[1]) : img.alt };
        b.style = { align: "center", rounded: "rounded-xl", padding: "py-2" };
        return b;
      }
      // fallback: treat as paragraph
      const text = stripTags(el.inner);
      if (!text) return null;
      const b = createBlock("paragraph");
      b.props = { text };
      b.style = { align: "left", padding: "py-2" };
      return b;
    }

    case "blockquote": {
      const text = stripTags(el.inner);
      if (!text) return null;
      // try to find a <cite> or footer for author
      const cite = el.inner.match(/<(?:cite|footer)\b[^>]*>([\s\S]*?)<\/(?:cite|footer)>/i);
      const b = createBlock("quote");
      b.props = { text, author: cite ? stripTags(cite[1]) : "" };
      b.style = { align: "left", padding: "py-6" };
      return b;
    }

    case "ul":
    case "ol": {
      const items = el.inner
        .split(/<li\b[^>]*>/i)
        .slice(1)
        .map((li) => {
          const end = li.indexOf("</li>");
          return end === -1 ? li : li.slice(0, end);
        });
      if (items.length >= 3) {
        const features = items.slice(0, 6).map((li) => {
          const title = stripTags(li).split(/[.:—–-]/)[0].trim() || "Feature";
          const desc = stripTags(li);
          return { title: title.slice(0, 60), desc: desc.slice(0, 120) };
        });
        const b = createBlock("features");
        b.props = { features };
        b.style = { align: "center", padding: "py-12 px-6" };
        return b;
      }
      // 1-2 items → paragraph(s)
      return items
        .map((li) => {
          const text = stripTags(li);
          if (!text) return null;
          const b = createBlock("paragraph");
          b.props = { text: `${el.tag === "ul" ? "•" : "1."} ${text}` };
          b.style = { align: "left", padding: "py-1" };
          return b;
        })
        .filter((x): x is Block => x !== null);
    }

    case "hr": {
      const b = createBlock("divider");
      b.style = { padding: "py-4" };
      return b;
    }

    case "nav": {
      const links = extractLinks(el.inner).slice(0, 6);
      const brand = stripTags(el.inner.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "")).slice(0, 40) || "Site";
      const b = createBlock("nav");
      b.props = {
        brand,
        links: links.length ? links : [{ label: "Home", href: "#" }],
      };
      b.style = { align: "left", extraClass: "border-b" };
      return b;
    }

    case "header": {
      // Best-effort hero extraction: find the largest headline + first paragraph.
      const h = el.inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i);
      const p = el.inner.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
      const cta = extractLinks(el.inner)[0];
      const b = createBlock("hero");
      b.props = {
        badge: "",
        text: h ? stripTags(h[1]) : "Imported section",
        subtitle: p ? stripTags(p[1]) : "",
        ctaText: cta?.label ?? "",
        ctaHref: cta?.href ?? "#",
      };
      b.style = { align: "center", background: "bg-muted", padding: "py-20 px-6" };
      return b;
    }

    case "footer": {
      const links = extractLinks(el.inner).slice(0, 4);
      const brand = stripTags(el.inner).split(/©|\n/)[0].slice(0, 30) || "Site";
      const b = createBlock("footer");
      b.props = {
        brand,
        copyright: stripTags(el.inner).slice(0, 60),
        links: links.length ? links : [{ label: "Privacy", href: "#" }],
      };
      b.style = { align: "left", background: "bg-muted", padding: "py-8 px-6", extraClass: "border-t" };
      return b;
    }

    case "text": {
      const text = stripTags(el.html);
      if (!text) return null;
      const b = createBlock("paragraph");
      b.props = { text };
      b.style = { align: "left", padding: "py-2" };
      return b;
    }

    default: {
      // Unknown container (section, div, article, ...) → recurse into children.
      const children = splitTopLevel(el.inner);
      if (children.length === 0) {
        const text = stripTags(el.inner);
        if (!text) return null;
        const b = createBlock("paragraph");
        b.props = { text };
        b.style = { align: "left", padding: "py-2" };
        return b;
      }
      return children
        .map(mapElementToBlock)
        .filter((x): x is Block | Block[] => x !== null)
        .flat();
    }
  }
}

export interface ImportResult {
  blocks: Block[];
  warnings: string[];
}

/**
 * Convert WordPress rendered HTML to a Block[] array suitable for the Forge
 * canvas. Never throws — on parse problems it falls back to a single
 * paragraph block with the raw (escaped) HTML so content is preserved.
 */
export function htmlToBlocks(rawHtml: string): ImportResult {
  const warnings: string[] = [];
  let html = stripGutenbergComments(rawHtml);
  // Remove <script> and <style> blocks entirely (WP sometimes embeds these).
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");

  let elements: RawElement[];
  try {
    elements = splitTopLevel(html);
  } catch {
    return {
      blocks: [],
      warnings: ["HTML parser failed — no blocks extracted."],
    };
  }

  if (elements.length === 0) {
    return { blocks: [], warnings: ["No top-level elements found in the content."] };
  }

  const blocks: Block[] = [];
  for (const el of elements) {
    const result = mapElementToBlock(el);
    if (result === null) continue;
    if (Array.isArray(result)) blocks.push(...result);
    else blocks.push(result);
  }

  if (blocks.length === 0) {
    // Fallback: dump the whole thing as one paragraph.
    const text = stripTags(html).slice(0, 5000);
    if (text) {
      const b = createBlock("paragraph");
      b.props = { text };
      b.style = { align: "left", padding: "py-2" };
      blocks.push(b);
      warnings.push("Content could not be structured — imported as a single text block.");
    }
  }

  // Cap to a sane number of blocks so a 50k-word article doesn't freeze the canvas.
  const MAX = 60;
  if (blocks.length > MAX) {
    warnings.push(`Imported ${MAX} of ${blocks.length} blocks (truncated). Use Custom Code mode for the full page.`);
    blocks.length = MAX;
  }

  return { blocks, warnings };
}

// Re-export for the import route.
export type { BlockType };
