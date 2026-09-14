import type { Block, BlockStyle, SeoConfig } from "./types";
import { BLOCK_DEFINITIONS } from "./blocks";

// Build a compact textual summary of the page for the AI model.
export function buildPageContext(blocks: Block[], seo: SeoConfig): string {
  const lines: string[] = [];
  lines.push(`# Page: ${seo.title}`);
  lines.push(`Meta description: ${seo.description}`);
  lines.push(`Focus keyword: ${seo.focusKeyword || "(none)"}`);
  lines.push("");
  lines.push(`## Current blocks (${blocks.length})`);
  blocks.forEach((b, i) => {
    const def = BLOCK_DEFINITIONS.find((d) => d.type === b.type);
    lines.push(`${i + 1}. [${def?.label ?? b.type}] ${describeBlock(b)}`);
  });
  return lines.join("\n");
}

function describeBlock(b: Block): string {
  const p = b.props;
  switch (b.type) {
    case "nav":
      return `brand="${p.brand}" links=${(p.links ?? []).map((l) => l.label).join("/")}`;
    case "hero":
      return `badge="${p.badge}" text="${p.text}" subtitle="${p.subtitle}" cta="${p.ctaText}"`;
    case "heading":
      return `H${p.level}: "${p.text}"`;
    case "paragraph":
      return `"${truncate(p.text)}"`;
    case "button":
      return `"${p.text}" -> ${p.href} (${p.variant})`;
    case "image":
      return `src="${truncate(p.src)}" alt="${p.alt}"`;
    case "card":
      return `title="${p.title}" text="${truncate(p.text)}"`;
    case "features":
      return `${(p.features ?? []).length} features`;
    case "quote":
      return `"${truncate(p.text)}" — ${p.author}`;
    case "cta":
      return `"${p.text}" cta="${p.ctaText}"`;
    case "footer":
      return `brand="${p.brand}" copyright="${p.copyright}"`;
    default:
      return "";
  }
}

function truncate(s?: string, n = 80): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Turn a list of blocks into exportable HTML.
export function blocksToHtml(blocks: Block[], seo: SeoConfig): string {
  const head = buildHead(seo);
  const body = blocks.map(renderBlockToHtml).join("\n");
  return `<!DOCTYPE html>
<html lang="${seo.lang || "en"}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${head}
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-slate-900 antialiased">
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styleClass(style: BlockStyle): string {
  return [
    style.background,
    style.padding,
    style.rounded,
    style.extraClass,
    style.align === "center"
      ? "text-center"
      : style.align === "right"
      ? "text-right"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function renderBlockToHtml(b: Block): string {
  const cls = styleClass(b.style);
  const p = b.props;
  switch (b.type) {
    case "nav":
      return `  <nav class="flex items-center justify-between ${cls}">
    <span class="font-bold text-lg">${escapeHtml(p.brand ?? "")}</span>
    <div class="flex gap-6">
      ${(p.links ?? []).map((l) => `<a href="${l.href}" class="hover:underline">${escapeHtml(l.label)}</a>`).join("\n      ")}
    </div>
  </nav>`;
    case "hero":
      return `  <section class="${cls}">
    ${p.badge ? `<span class="inline-block mb-4 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">${escapeHtml(p.badge)}</span>` : ""}
    <h1 class="text-4xl md:text-5xl font-bold tracking-tight">${escapeHtml(p.text ?? "")}</h1>
    <p class="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">${escapeHtml(p.subtitle ?? "")}</p>
    <a href="${p.ctaHref ?? "#"}" class="mt-8 inline-flex items-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium">${escapeHtml(p.ctaText ?? "")}</a>
  </section>`;
    case "heading": {
      const tag = `h${p.level ?? 2}`;
      return `  <${tag} class="font-bold tracking-tight ${cls}">${escapeHtml(p.text ?? "")}</${tag}>`;
    }
    case "paragraph":
      return `  <p class="text-muted-foreground ${cls}">${escapeHtml(p.text ?? "")}</p>`;
    case "button": {
      const variants: Record<string, string> = {
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border",
        ghost: "hover:bg-accent",
      };
      return `  <div class="${cls}"><a href="${p.href ?? "#"}" class="inline-flex items-center px-5 py-2.5 rounded-lg font-medium ${variants[p.variant ?? "primary"]}">${escapeHtml(p.text ?? "")}</a></div>`;
    }
    case "image":
      return `  <div class="${cls}"><img src="${p.src ?? ""}" alt="${escapeHtml(p.alt ?? "")}" class="max-w-full h-auto ${cls}" /></div>`;
    case "card":
      return `  <div class="${cls}">
    <h3 class="font-semibold text-lg">${escapeHtml(p.title ?? "")}</h3>
    <p class="text-muted-foreground mt-2">${escapeHtml(p.text ?? "")}</p>
  </div>`;
    case "features":
      return `  <section class="${cls}">
    <div class="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      ${(p.features ?? [])
        .map(
          (f) => `<div class="p-6 rounded-xl border bg-card">
        <h3 class="font-semibold">${escapeHtml(f.title)}</h3>
        <p class="text-muted-foreground mt-1">${escapeHtml(f.desc)}</p>
      </div>`,
        )
        .join("\n      ")}
    </div>
  </section>`;
    case "quote":
      return `  <blockquote class="${cls} border-l-4 pl-4 italic text-lg">${escapeHtml(p.text ?? "")}<footer class="mt-2 text-sm text-muted-foreground not-italic">— ${escapeHtml(p.author ?? "")}</footer></blockquote>`;
    case "cta":
      return `  <section class="${cls}">
    <h2 class="text-2xl font-bold">${escapeHtml(p.text ?? "")}</h2>
    <a href="${p.ctaHref ?? "#"}" class="mt-6 inline-flex items-center px-6 py-3 rounded-lg bg-background text-foreground font-medium">${escapeHtml(p.ctaText ?? "")}</a>
  </section>`;
    case "divider":
      return `  <hr class="${cls}" />`;
    case "spacer":
      return `  <div class="${cls}"></div>`;
    case "footer":
      return `  <footer class="${cls}">
    <div class="flex items-center justify-between max-w-5xl mx-auto flex-wrap gap-4">
      <span class="font-semibold">${escapeHtml(p.brand ?? "")}</span>
      <span class="text-sm text-muted-foreground">© ${new Date().getFullYear()} ${escapeHtml(p.copyright ?? "")}</span>
      <div class="flex gap-4">
        ${(p.links ?? []).map((l) => `<a href="${l.href}" class="text-sm hover:underline">${escapeHtml(l.label)}</a>`).join("\n        ")}
      </div>
    </div>
  </footer>`;
    default:
      return "";
  }
}

function buildHead(seo: SeoConfig): string {
  const tags: string[] = [];
  if (seo.title) tags.push(`  <title>${escapeHtml(seo.title)}</title>`);
  if (seo.description)
    tags.push(`  <meta name="description" content="${escapeHtml(seo.description)}" />`);
  if (seo.keywords)
    tags.push(`  <meta name="keywords" content="${escapeHtml(seo.keywords)}" />`);
  if (seo.author)
    tags.push(`  <meta name="author" content="${escapeHtml(seo.author)}" />`);
  if (seo.robots)
    tags.push(`  <meta name="robots" content="${escapeHtml(seo.robots)}" />`);
  if (seo.canonical)
    tags.push(`  <link rel="canonical" href="${escapeHtml(seo.canonical)}" />`);
  if (seo.ogTitle)
    tags.push(`  <meta property="og:title" content="${escapeHtml(seo.ogTitle)}" />`);
  if (seo.ogDescription)
    tags.push(`  <meta property="og:description" content="${escapeHtml(seo.ogDescription)}" />`);
  if (seo.ogImage)
    tags.push(`  <meta property="og:image" content="${escapeHtml(seo.ogImage)}" />`);
  if (seo.ogType)
    tags.push(`  <meta property="og:type" content="${escapeHtml(seo.ogType)}" />`);
  if (seo.canonical)
    tags.push(`  <meta property="og:url" content="${escapeHtml(seo.canonical)}" />`);
  tags.push(`  <meta name="twitter:card" content="${seo.twitterCard}" />`);
  if (seo.twitterSite)
    tags.push(`  <meta name="twitter:site" content="${escapeHtml(seo.twitterSite)}" />`);
  if (seo.ogTitle)
    tags.push(`  <meta name="twitter:title" content="${escapeHtml(seo.ogTitle)}" />`);
  if (seo.ogDescription)
    tags.push(`  <meta name="twitter:description" content="${escapeHtml(seo.ogDescription)}" />`);
  if (seo.jsonLd.trim())
    tags.push(`  <script type="application/ld+json">\n${seo.jsonLd}\n  </script>`);
  return tags.join("\n");
}
