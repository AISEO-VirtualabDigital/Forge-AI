// POST /api/wordpress/seo-status
//
// Calls the Forge SEO Connector plugin's /forge-seo/v1/status endpoint to
// report which SEO plugins are active on the connected WordPress site.
// This is how Forge discovers whether Yoast, Rank Math, both, or neither is
// installed — and therefore where to push SEO meta.

import { wpBasicAuth, wpUrl } from "@/lib/wordpress";
import type { WordPressConfig } from "@/lib/types";

interface StatusResponse {
  plugin_version?: string;
  wordpress_version?: string;
  site_name?: string;
  site_url?: string;
  active_plugins?: { yoast: boolean; rank_math: boolean };
  versions?: { yoast?: string; rank_math?: string };
  primary?: "yoast" | "rank_math" | "none";
}

export async function POST(req: Request): Promise<Response> {
  let config: WordPressConfig;
  try {
    config = (await req.json()) as WordPressConfig;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

  const url = wpUrl(config, "/wp-json/forge-seo/v1/status");
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: wpBasicAuth(config),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 404) {
      // The plugin is not installed — that's a useful, non-error signal.
      return Response.json(
        {
          installed: false,
          message:
            "Forge SEO Connector plugin not detected. Install it to enable live SEO sync with Yoast / Rank Math.",
        },
        { status: 200 },
      );
    }

    if (res.status === 401 || res.status === 403) {
      return Response.json(
        { installed: true, authenticated: false, error: "Invalid credentials" },
        { status: 401 },
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json(
        {
          installed: true,
          error: `WordPress returned ${res.status}`,
          detail: text.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const data = (await res.json()) as StatusResponse;
    return Response.json({
      installed: true,
      authenticated: true,
      ...data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return Response.json({ installed: false, error: message }, { status: 504 });
  }
}
