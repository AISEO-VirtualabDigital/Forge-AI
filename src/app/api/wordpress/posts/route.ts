// POST /api/wordpress/posts
//
// Lists existing WordPress posts via the REST API. The browser sends the full
// WordPressConfig in the body each call (credentials live client-side in
// localStorage) plus optional pagination/search fields. We use Basic auth and
// forward the `per_page`, `page` and `search` query parameters. WordPress
// returns totals in the `x-wp-total` and `x-wp-totalpages` response headers.

import { wpBasicAuth, wpUrl } from "@/lib/wordpress";
import type { WordPressConfig, WordPressPost } from "@/lib/types";

interface PostsRequestBody {
  config?: WordPressConfig;
  page?: number;
  perPage?: number;
  search?: string;
}

interface WpPostListItem {
  id?: number;
  title?: { rendered?: string } | string;
  status?: string;
  slug?: string;
  link?: string;
  date?: string;
  modified?: string;
}

interface WpErrorBody {
  code?: string;
  message?: string;
  data?: { status?: number };
}

function isValidConfig(config: WordPressConfig): boolean {
  return (
    typeof config.siteUrl === "string" &&
    /^https?:\/\/.+/i.test(config.siteUrl) &&
    typeof config.username === "string" &&
    config.username.length > 0 &&
    typeof config.appPassword === "string" &&
    config.appPassword.length > 0
  );
}

function titleAsString(title: WpPostListItem["title"]): string {
  if (typeof title === "string") return title;
  if (title && typeof title.rendered === "string") return title.rendered;
  return "";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function POST(req: Request): Promise<Response> {
  let body: PostsRequestBody;
  try {
    body = (await req.json()) as PostsRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = body.config;
  if (!config || !isValidConfig(config)) {
    return Response.json(
      { error: "Invalid WordPress configuration" },
      { status: 400 },
    );
  }

  const page = clampInt(body.page, 1, 1000, 1);
  const perPage = clampInt(body.perPage, 1, 100, 10);
  const search =
    typeof body.search === "string" && body.search.trim().length > 0
      ? body.search.trim()
      : "";

  // Build the query string. `_fields` keeps the response small.
  const params = new URLSearchParams({
    _fields: "id,title,status,slug,link,date,modified",
    per_page: String(perPage),
    page: String(page),
  });
  if (search) params.set("search", search);

  let res: Response;
  try {
    res = await fetch(
      wpUrl(config, `/wp-json/wp/v2/posts?${params.toString()}`),
      {
        headers: {
          Authorization: wpBasicAuth(config),
          Accept: "application/json",
        },
        redirect: "error",
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return Response.json({ error: message }, { status: 504 });
  }

  if (res.status === 401 || res.status === 403) {
    return Response.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  if (!res.ok) {
    let wpErr: WpErrorBody = {};
    try {
      wpErr = (await res.json()) as WpErrorBody;
    } catch {
      // Ignore — fall back to a generic message.
    }
    const message =
      typeof wpErr.message === "string" && wpErr.message.length > 0
        ? wpErr.message
        : "Failed to list posts";
    return Response.json({ error: message }, { status: 502 });
  }

  let items: WpPostListItem[];
  try {
    items = (await res.json()) as WpPostListItem[];
  } catch {
    return Response.json(
      { error: "WordPress returned non-JSON response" },
      { status: 502 },
    );
  }

  const posts: WordPressPost[] = Array.isArray(items)
    ? items.map((p) => ({
        id: typeof p.id === "number" ? p.id : 0,
        title: titleAsString(p.title),
        status: typeof p.status === "string" ? p.status : "",
        slug: typeof p.slug === "string" ? p.slug : "",
        link: typeof p.link === "string" ? p.link : "",
        date: typeof p.date === "string" ? p.date : "",
        modified: typeof p.modified === "string" ? p.modified : "",
      }))
    : [];

  const totalHeader = res.headers.get("x-wp-total");
  const totalPagesHeader = res.headers.get("x-wp-totalpages");
  const totalNum = totalHeader ? Number.parseInt(totalHeader, 10) : NaN;
  const totalPagesNum = totalPagesHeader
    ? Number.parseInt(totalPagesHeader, 10)
    : NaN;

  return Response.json({
    posts,
    total: Number.isFinite(totalNum) ? totalNum : posts.length,
    totalPages: Number.isFinite(totalPagesNum) ? totalPagesNum : 1,
  });
}
