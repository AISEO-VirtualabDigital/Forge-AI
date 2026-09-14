// POST /api/wordpress/import
//
// Imports an existing WordPress post into Forge as editable blocks.
//   1. Fetches the post (title + rendered HTML + slug + link) via the WP REST API.
//   2. Tries to fetch its live SEO meta via the Forge SEO Connector plugin
//      (degrades gracefully if the plugin isn't installed — uses WP's title/
//      excerpt as fallback SEO).
//   3. Converts the rendered HTML to Block[] via the heuristic htmlToBlocks
//      parser.
//   4. Returns a ready-to-load project shape: { blocks, seo, projectName,
//      wpPost: {...}, warnings }.
//
// The client then loads this into the builder + stores wpPostId so "push back"
// updates the same post.

import { wpBasicAuth, wpUrl } from "@/lib/wordpress";
import { htmlToBlocks } from "@/lib/html-to-blocks";
import { DEFAULT_SEO } from "@/lib/seo";
import type { Block, SeoConfig, WordPressConfig } from "@/lib/types";

interface WpPostResponse {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  slug: string;
  link: string;
  status: string;
  excerpt?: { rendered: string };
  date: string;
  modified: string;
  author?: number;
}

interface ForgeSeoResponse {
  seo?: Partial<SeoConfig>;
}

interface ImportBody {
  config: WordPressConfig;
  postId: number;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request): Promise<Response> {
  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { config } = body;
  const postId = Number(body.postId);
  if (
    !config?.siteUrl ||
    !/^https?:\/\//i.test(config.siteUrl) ||
    !config.username ||
    !config.appPassword
  ) {
    return Response.json(
      { error: "Invalid WordPress configuration" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(postId) || postId <= 0) {
    return Response.json({ error: "postId is required" }, { status: 400 });
  }

  const auth = wpBasicAuth(config);

  // ---- 1. Fetch the WP post ----
  let post: WpPostResponse;
  try {
    const res = await fetch(
      wpUrl(config, `/wp-json/wp/v2/posts/${postId}?_fields=id,title,content,slug,link,status,excerpt,date,modified,author`),
      {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (res.status === 404) {
      return Response.json(
        { error: `WordPress post #${postId} not found` },
        { status: 404 },
      );
    }
    if (res.status === 401 || res.status === 403) {
      return Response.json(
        { error: "WordPress rejected the credentials" },
        { status: 401 },
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json(
        { error: `WordPress returned ${res.status}`, detail: text.slice(0, 300) },
        { status: 502 },
      );
    }
    post = (await res.json()) as WpPostResponse;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Network error fetching post" },
      { status: 504 },
    );
  }

  // ---- 2. Fetch SEO meta from the Forge SEO Connector plugin (best-effort) ----
  let seo: SeoConfig = { ...DEFAULT_SEO };
  let seoSource: "plugin" | "fallback" = "fallback";
  try {
    const seoRes = await fetch(
      wpUrl(config, `/wp-json/forge-seo/v1/seo?post_id=${postId}`),
      {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (seoRes.ok) {
      const seoData = (await seoRes.json()) as ForgeSeoResponse;
      if (seoData.seo) {
        seo = { ...DEFAULT_SEO, ...seoData.seo } as SeoConfig;
        seoSource = "plugin";
      }
    }
    // 404 → plugin not installed; non-ok → ignore, fall back below.
  } catch {
    // network error contacting the plugin — ignore, fall back.
  }

  // Fallback SEO: derive from the WP post itself.
  if (seoSource === "fallback") {
    const title = stripHtml(post.title?.rendered ?? "");
    const excerpt = stripHtml(post.excerpt?.rendered ?? "");
    seo = {
      ...DEFAULT_SEO,
      title: title || DEFAULT_SEO.title,
      description: excerpt.slice(0, 160) || DEFAULT_SEO.description,
      canonical: post.link || DEFAULT_SEO.canonical,
      ogTitle: title,
      ogDescription: excerpt.slice(0, 160),
      author: "Imported from WordPress",
    };
  }

  // ---- 3. Convert HTML → Block[] ----
  const html = post.content?.rendered ?? "";
  const { blocks, warnings } = htmlToBlocks(html);

  // ---- 4. Assemble the result ----
  return Response.json({
    wpPost: {
      id: post.id,
      title: stripHtml(post.title?.rendered ?? ""),
      slug: post.slug,
      link: post.link,
      status: post.status,
      date: post.date,
      modified: post.modified,
    },
    blocks: blocks as Block[],
    seo,
    seoSource, // "plugin" if we got live Yoast/RankMath meta, "fallback" otherwise
    projectName: stripHtml(post.title?.rendered ?? "") || "Imported post",
    blockCount: blocks.length,
    warnings,
    htmlLength: html.length,
  });
}
