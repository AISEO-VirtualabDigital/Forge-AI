# Yoast SEO & Rank Math — Technical Analysis

Research basis: web search of official docs (developer.yoast.com, rankmath.com),
WordPress.org support threads, and GitHub community plugins
(e.g. `Devora-AS/rank-math-api-manager`, gist `WordPress SEO REST API meta mu-plugins`).

## 1. Yoast SEO

### Where Yoast stores SEO data
All per-post SEO data is stored in the `wp_postmeta` table using the
`_yoast_wpseo_*` prefix:

| Field | Meta key |
|---|---|
| SEO title | `_yoast_wpseo_title` |
| Meta description | `_yoast_wpseo_metadesc` |
| Focus keyphrase | `_yoast_wpseo_focuskw` |
| Additional keyphrases | `_yoast_wpseo_focuskeywords` (JSON array, newer versions) |
| Robots noindex | `_yoast_wpseo_meta-robots-noindex` |
| Robots nofollow | `_yoast_wpseo_meta-robots-nofollow` |
| Robots advanced | `_yoast_wpseo_meta-robots-adv` (e.g. `none`, `noodp`) |
| Canonical URL | `_yoast_wpseo_canonical` |
| OG title | `_yoast_wpseo_opengraph-title` |
| OG description | `_yoast_wpseo_opengraph-description` |
| OG image | `_yoast_wpseo_opengraph-image` |
| Twitter title | `_yoast_wpseo_twitter-title` |
| Twitter description | `_yoast_wpseo_twitter-description` |
| Twitter image | `_yoast_wpseo_twitter-image` |
| Schema article type | `_yoast_wpseo_schema_article_type` |
| Schema page type | `_yoast_wpseo_schema_page_type` |
| Breadcrumbs title | `_yoast_wpseo_bctitle` |
| Primary category | `_yoast_wpseo_primary_category` |

### REST API exposure
Yoast **registers a read-only REST field** `yoast_head_json` on every public
post type. So a plain `GET /wp-json/wp/v2/posts/123` already returns the
*rendered* SEO data:

```json
{
  "yoast_head_json": {
    "title": "My Page — SiteName",
    "description": "Rendered meta description…",
    "og_title": "…",
    "og_description": "…",
    "og_image": ["https://…"],
    "twitter_title": "…",
    "twitter_description": "…",
    "twitter_image": "https://…",
    "canonical": "https://example.com/my-page",
    "robots": { "index": "index", "follow": "follow" },
    "schema": { "@graph": [ … ] }
  }
}
```

**Important limitation:** `yoast_head_json` is **read-only and rendered**
(variables like `%%sitename%%` are already substituted). You cannot write
SEO data back through the standard WP REST API. To *write* Yoast fields you
must either:
- POST to `/wp-json/wp/v2/posts/123` with a `meta` field — but Yoast's meta
  keys are **not registered as `show_in_rest = true`**, so WP silently drops
  them; OR
- Register the keys yourself via `register_post_meta()` /
  `register_rest_field()` in a small mu-plugin.

That last point is exactly what our unified connector plugin does.

### Yoast variables
Yoast SEO titles and descriptions support template variables:
`%%sitename%%`, `%%sitedesc%%`, `%%title%%`, `%%page%%`, `%%sep%%`,
`%%excerpt%%`, `%%primary_category%%`, `%%focuskw%%`, `%%cf_<custom-field>%%`,
`%%ct_<custom-taxonomy>%%`, etc. When writing raw values you normally bypass
variables (you write the final string).

## 2. Rank Math

### Where Rank Math stores SEO data
Rank Math uses the `rank_math_*` prefix in `wp_postmeta`:

| Field | Meta key |
|---|---|
| SEO title | `rank_math_title` |
| Meta description | `rank_math_description` |
| Focus keyword(s) | `rank_math_focus_keyword` (comma-separated multi-keyword) |
| Robots directives | `rank_math_robots` (serialized array: `a:2:{i:0;s:5:"index";i:1;s:6:"follow";}` — or `noindex`,`nofollow`) |
| Canonical URL | `rank_math_canonical_url` |
| OG title | `rank_math_facebook_title` |
| OG description | `rank_math_facebook_description` |
| OG image | `rank_math_facebook_image` |
| OG image ID | `rank_math_facebook_image_id` |
| Twitter title | `rank_math_twitter_title` |
| Twitter description | `rank_math_twitter_description` |
| Twitter image | `rank_math_twitter_image` |
| Twitter image ID | `rank_math_twitter_image_id` |
| Schema type | `rank_math_schema_*` (e.g. `rank_math_schema_Article`) — stored as JSON |
| Rich snippet type | `rank_math_rich_snippet` |
| Article type | `rank_math_snippet_article_type` |
| Review location | `rank_math_snippet_review_location` |
| Has video | `rank_math_video_*` |
| Has FAQ schema | `rank_math_snippet_qa_pages` |
| Primary term (per taxonomy) | `rank_math_primary_*` |

### REST API exposure
Rank Math is **more locked down than Yoast**: it does **not** expose a
`*_head_json` REST field by default. Reading/writing Rank Math SEO data
through the WP REST API requires either:
- A community plugin like **Devora-AS/rank-math-api-manager** that registers
  `rank_math_*` meta with `show_in_rest = true` and exposes a `/rank-math/v1`
  namespace; OR
- Custom `register_post_meta()` + `register_rest_field()` code (which is
  exactly what our unified plugin ships).

### Rank Math variables
Rank Math also supports template variables: `%title%`, `%sitename%`,
`%sitedesc%`, `%excerpt%`, `%focuskw%`, `%sep%`, `%page%`, `%currentdate%`,
`%currenttime%`, `%author%`, `%primary_taxonomy_terms_name%`, etc.
(Notably Rank Math uses single `%var%` while Yoast uses `%%var%%`.)

## 3. Comparison at a glance

| Concern | Yoast SEO | Rank Math |
|---|---|---|
| Storage | `wp_postmeta` `_yoast_wpseo_*` | `wp_postmeta` `rank_math_*` |
| Variable syntax | `%%var%%` | `%var%` |
| Native read REST | ✅ `yoast_head_json` (rendered) | ❌ none |
| Native write REST | ❌ meta not `show_in_rest` | ❌ meta not `show_in_rest` |
| Focus keyword model | single keyphrase + additional JSON list | comma-separated string |
| Robots storage | separate noindex / nofollow / adv keys | serialized array |
| Schema storage | `_yoast_wpseo_schema_article_type` + global graph | `rank_math_schema_*` JSON per post |
| License | GPL (wordpress.org SVN repo) | GPL (wordpress.org / freemium) |

## 4. The problem Forge needs to solve
When Forge publishes a page to WordPress, the SEO settings (title,
description, focus keyword, OG tags, canonical, robots, JSON-LD) must land in
**whichever** SEO plugin the site happens to use — and the user might not
even know which one is installed. A naïve `POST /wp-json/wp/v2/posts` will
silently drop all SEO meta because neither plugin registers it as
`show_in_rest = true`.

## 5. Solution: a unified connector plugin
A single WordPress plugin — **Forge SEO Connector** — that:

1. **Detects** which SEO plugin(s) are active at request time.
2. **Normalizes** reads: returns one canonical SEO payload regardless of
   whether Yoast, Rank Math, or neither is driving the meta tags.
3. **Translates writes**: accepts the same canonical payload and writes it
   to the correct meta keys for the active plugin (Yoast keys if Yoast is
   active, Rank Math keys if Rank Math is active, both if both are active,
   and a generic fallback if neither is).
4. Exposes a dedicated, Basic-Auth protected REST namespace
   `forge-seo/v1` so Forge can call it directly without fighting WP core's
   meta visibility rules.

This is the plugin shipped in `wordpress-plugin/forge-seo-connector/`.
