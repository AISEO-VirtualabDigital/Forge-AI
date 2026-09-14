// POST /api/wordpress/publish
//
// Creates a WordPress post via the REST API. The browser sends the full
// WordPressConfig in the body each call (credentials live client-side in
// localStorage). We use Basic auth and a JSON body containing the post
// fields. On success we echo back a normalized WordPressPost.

import { wpBasicAuth, wpUrl } from "@/lib/wordpress";
import type { WordPressConfig, WordPressPost } from "@/lib/types";

type PublishStatus = "draft" | "publish" | "private";

interface PublishRequestBody {
  config?: WordPressConfig;
  title?: string;
  content?: string;
  status?: PublishStatus;
  slug?: string;
  excerpt?: string;
}

interface WpPostResponse {
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

function isPublishStatus(value: unknown): value is PublishStatus {
  return value === "draft" || value === "publish" || value === "private";
}

function titleAsString(title: WpPostResponse["title"]): string {
  if (typeof title === "string") return title;
  if (title && typeof title.rendered === "string") return title.rendered;
  return "";
}

export async function POST(req: Request): Promise<Response> {
  let body: PublishRequestBody;
  try {
    body = (await req.json()) as PublishRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = body.config;
  if (!config || !isValidConfig(config)) {
    return Response.json(
      { success: false, error: "Invalid WordPress configuration" },
      { status: 400 },
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const status: PublishStatus = isPublishStatus(body.status)
    ? body.status
    : "draft";
  const slug =
    typeof body.slug === "string" && body.slug.trim().length > 0
      ? body.slug.trim()
      : undefined;
  const excerpt =
    typeof body.excerpt === "string" && body.excerpt.trim().length > 0
      ? body.excerpt
      : undefined;

  if (!title || !content) {
    return Response.json(
      { success: false, error: "title and content are required" },
      { status: 400 },
    );
  }

  // Build the WP REST payload. Only include optional fields when present so we
  // don't overwrite a server-side default with an empty string.
  const payload: Record<string, unknown> = { title, content, status };
  if (slug) payload.slug = slug;
  if (excerpt) payload.excerpt = excerpt;

  let res: Response;
  try {
    res = await fetch(wpUrl(config, "/wp-json/wp/v2/posts"), {
      method: "POST",
      headers: {
        Authorization: wpBasicAuth(config),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      redirect: "error",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return Response.json(
      { success: false, error: message },
      { status: 504 },
    );
  }

  if (res.status === 401 || res.status === 403) {
    return Response.json(
      { success: false, error: "Invalid credentials", wpCode: "unauthorized" },
      { status: 401 },
    );
  }

  // WordPress responds with 201 Created on a successful POST.
  if (res.status !== 201 && !res.ok) {
    let wpErr: WpErrorBody = {};
    try {
      wpErr = (await res.json()) as WpErrorBody;
    } catch {
      // Ignore JSON parse failures — we still report the status.
    }
    const wpCode =
      typeof wpErr.code === "string" ? wpErr.code : `http_${res.status}`;
    const message =
      typeof wpErr.message === "string"
        ? wpErr.message
        : `WordPress returned status ${res.status}`;
    const statusOut = wpErr.data?.status ?? res.status;
    return Response.json(
      { success: false, error: message, wpCode },
      { status: typeof statusOut === "number" ? statusOut : res.status },
    );
  }

  let post: WpPostResponse;
  try {
    post = (await res.json()) as WpPostResponse;
  } catch {
    return Response.json(
      { success: false, error: "WordPress returned non-JSON response" },
      { status: 502 },
    );
  }

  const normalized: WordPressPost = {
    id: typeof post.id === "number" ? post.id : 0,
    title: titleAsString(post.title),
    status: typeof post.status === "string" ? post.status : status,
    slug: typeof post.slug === "string" ? post.slug : "",
    link: typeof post.link === "string" ? post.link : "",
    date: typeof post.date === "string" ? post.date : "",
    modified: typeof post.modified === "string" ? post.modified : "",
  };

  return Response.json({ success: true, post: normalized }, { status: 201 });
}
