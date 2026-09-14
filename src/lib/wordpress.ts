// WordPress REST API helper (server-only).
//
// The browser stores WordPressConfig in localStorage (credentials never touch
// our DB) and sends it on each request. These helpers normalize the site URL
// and build the Basic auth header so route handlers can stay short and
// consistent. NEVER log `appPassword` — only use it to build the header.

import type { WordPressConfig } from "@/lib/types";

/**
 * Build the `Basic <base64>` Authorization header value for the given config.
 * Returns the full header value (e.g. `Basic dXNlcjphcHA=`) ready to drop into
 * a `Headers` object.
 */
export function wpBasicAuth(config: WordPressConfig): string {
  // Buffer is available in the Node runtime (this lib is server-only).
  const token = Buffer.from(
    `${config.username}:${config.appPassword}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/**
 * Build an absolute WordPress REST URL from the config and a path.
 *
 * - Strips any trailing slash from `config.siteUrl`.
 * - Ensures `path` starts with a single `/`.
 *
 * Example: wpUrl({ siteUrl: "https://x.com/" }, "/wp-json/wp/v2/posts")
 *       -> "https://x.com/wp-json/wp/v2/posts"
 */
export function wpUrl(config: WordPressConfig, path: string): string {
  const base = config.siteUrl.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
