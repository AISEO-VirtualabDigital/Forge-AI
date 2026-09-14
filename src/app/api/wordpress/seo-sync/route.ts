// POST /api/wordpress/seo-sync
//
// Bidirectional proxy for the Forge SEO Connector plugin's /forge-seo/v1/seo
// endpoint. Two modes selected by `op`:
//
//   op: "get"  → body { config, postId }           → returns normalized SEO from WP
//   op: "put"  → body { config, postId, seo }      → pushes Forge's SEO to WP
//
// We proxy (rather than call WP directly from the browser) so:
//   1. CORS is never an issue.
//   2. The app password never reaches the client bundle beyond the dialog.
//   3. We can add validation / logging / rate limiting here.

import { wpBasicAuth, wpUrl } from "@/lib/wordpress";
import type { SeoConfig, WordPressConfig } from "@/lib/types";

interface GetBody {
  config: WordPressConfig;
  postId: number;
}

interface PutBody {
  config: WordPressConfig;
  postId: number;
  seo: Partial<SeoConfig>;
}

function validateConfig(c: WordPressConfig | undefined): c is WordPressConfig {
  return (
    !!c &&
    typeof c.siteUrl === "string" &&
    /^https?:\/\//i.test(c.siteUrl) &&
    typeof c.username === "string" &&
    c.username.length > 0 &&
    typeof c.appPassword === "string" &&
    c.appPassword.length > 0
  );
}

export async function POST(req: Request): Promise<Response> {
  let body: GetBody | PutBody;
  try {
    body = (await req.json()) as GetBody | PutBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = (body as GetBody).config;
  if (!validateConfig(config)) {
    return Response.json(
      { error: "Invalid WordPress configuration" },
      { status: 400 },
    );
  }

  const postId = Number((body as GetBody).postId);
  if (!Number.isFinite(postId) || postId <= 0) {
    return Response.json({ error: "postId is required" }, { status: 400 });
  }

  const op =
    "seo" in body && body.seo && typeof body.seo === "object" ? "put" : "get";

  const url =
    op === "put"
      ? wpUrl(config, `/wp-json/forge-seo/v1/seo?post_id=${postId}`)
      : wpUrl(config, `/wp-json/forge-seo/v1/seo?post_id=${postId}`);

  try {
    const headers: Record<string, string> = {
      Authorization: wpBasicAuth(config),
      Accept: "application/json",
    };

    let res: Response;
    if (op === "put") {
      headers["Content-Type"] = "application/json";
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify((body as PutBody).seo),
        signal: AbortSignal.timeout(20000),
      });
    } else {
      res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(15000),
      });
    }

    if (res.status === 404) {
      return Response.json(
        {
          error:
            "Forge SEO Connector plugin not installed on this WordPress site.",
          install_hint:
            "Upload the forge-seo-connector zip via WP Admin → Plugins → Add New → Upload.",
        },
        { status: 404 },
      );
    }

    if (res.status === 401 || res.status === 403) {
      return Response.json(
        { error: "WordPress rejected the credentials" },
        { status: 401 },
      );
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: data?.message || `WordPress returned ${res.status}` },
        { status: res.status },
      );
    }

    return Response.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return Response.json({ error: message }, { status: 504 });
  }
}
