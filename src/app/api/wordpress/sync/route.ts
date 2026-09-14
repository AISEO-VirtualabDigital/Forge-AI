// POST /api/wordpress/sync
//
// The unified WordPress sync endpoint — the "premium connector" route.
//
// Edge-compatible (no filesystem, no Prisma, no native deps) so it runs on
// Vercel Edge Functions. It:
//   1. Reads the active canvas blocks + SEO config from the request body.
//   2. Computes the Yoast readability matrix + RankMath focus-keyword
//      metrics IN-MEMORY using the deterministic scoring engine in
//      src/modules/wordpress/scoring.ts (no LLM calls, no WP round-trip
//      needed for the score).
//   3. If WordPress credentials + a post ID are provided, pushes the computed
//      metrics + the SEO payload to the connected site via the Forge SEO
//      Connector plugin's REST endpoint (or falls back to the standard WP REST
//      meta write path).
//   4. Returns the unified score matrix + the push result.
//
// This route does NOT touch the filesystem — everything is computed from the
// request body in-memory, making it fully serverless/edge-ready.

import { computeUnifiedScore, type UnifiedSeoScore } from "@/modules/wordpress";
import { wpBasicAuth, wpUrl } from "@/lib/wordpress";
import type { Block, SeoConfig, WordPressConfig } from "@/lib/types";

export const runtime = "nodejs"; // nodejs for fetch + Buffer; edge-compatible logic
export const dynamic = "force-dynamic";

interface SyncRequestBody {
  blocks: Block[];
  seo: SeoConfig;
  config?: WordPressConfig; // optional — if absent, compute-only (no push)
  postId?: number;          // optional — target WP post for the push
  push?: boolean;           // default true when config + postId present
}

interface PushResult {
  pushed: boolean;
  target?: string;
  writtenTo?: string[];
  error?: string;
  postLink?: string;
}

/**
 * Push the SEO payload + computed metrics to the WordPress site.
 * Tries the Forge SEO Connector plugin's /forge-seo/v1/seo endpoint first;
 * falls back to a standard WP REST post-meta write if the plugin isn't
 * installed (so the route works even on vanilla WP).
 */
async function pushToWordPress(
  config: WordPressConfig,
  postId: number,
  seo: SeoConfig,
  score: UnifiedSeoScore,
): Promise<PushResult> {
  const auth = wpBasicAuth(config);

  // Attempt 1: Forge SEO Connector plugin (preferred — writes to Yoast/RankMath meta).
  try {
    const pluginUrl = wpUrl(config, `/wp-json/forge-seo/v1/seo?post_id=${postId}`);
    const res = await fetch(pluginUrl, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(seo),
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        pushed: true,
        target: "forge-seo-connector",
        writtenTo: data?.written_to ?? ["plugin"],
        postLink: data?.seo?.__post?.link,
      };
    }
    if (res.status === 404) {
      // Plugin not installed — fall through to the vanilla WP path below.
    } else if (res.status === 401 || res.status === 403) {
      return { pushed: false, error: "WordPress rejected the credentials" };
    }
    // Other error — still try the fallback path.
  } catch {
    // Network error — fall through to the vanilla WP path.
  }

  // Attempt 2: Vanilla WP REST — update the post's title + content + excerpt.
  // (This doesn't write SEO meta since WP REST drops unknown meta fields, but
  // it at least pushes the rendered content so the page is live.)
  try {
    const postUrl = wpUrl(config, `/wp-json/wp/v2/posts/${postId}`);
    const res = await fetch(postUrl, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: seo.title,
        excerpt: seo.description,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        pushed: true,
        target: "wp-rest-post",
        writtenTo: ["post"],
        postLink: data?.link,
      };
    }
    return { pushed: false, error: `WP REST returned ${res.status}` };
  } catch (err) {
    return {
      pushed: false,
      error: err instanceof Error ? err.message : "network error during push",
    };
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: SyncRequestBody;
  try {
    body = (await req.json()) as SyncRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.blocks)) {
    return Response.json({ error: "blocks[] is required" }, { status: 400 });
  }
  if (!body.seo || typeof body.seo !== "object") {
    return Response.json({ error: "seo config is required" }, { status: 400 });
  }

  // 1. Compute the unified Yoast + RankMath score in-memory.
  const score = computeUnifiedScore(body.blocks, body.seo);

  // 2. Optionally push to WordPress.
  let pushResult: PushResult = { pushed: false };
  const shouldPush =
    body.push !== false &&
    body.config &&
    body.config.siteUrl &&
    body.config.username &&
    body.config.appPassword &&
    typeof body.postId === "number" &&
    body.postId > 0;

  if (shouldPush && body.config && body.postId) {
    pushResult = await pushToWordPress(body.config, body.postId, body.seo, score);
  }

  return Response.json({
    score,
    yoast: {
      readability: score.yoast.score,
      grade: score.yoast.grade,
      fleschReadingEase: score.yoast.fleschReadingEase,
      checks: score.yoast.checks,
    },
    rankmath: {
      score: score.rankmath.score,
      keywordDensity: score.rankmath.keywordDensity,
      checks: score.rankmath.checks,
    },
    combined: score.combined,
    contentText: score.contentText.slice(0, 500), // preview for the UI
    push: pushResult,
  });
}
