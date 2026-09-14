# Forge SEO Connector

A lightweight WordPress plugin that exposes a **unified, normalized REST API**
for SEO metadata — so the [Forge website builder](https://forge.example.com/)
can read and write live SEO data regardless of which SEO plugin is active.

It detects and bridges:

- **Yoast SEO** (`_yoast_wpseo_*` meta keys)
- **Rank Math** (`rank_math_*` meta keys)
- **Both at once** (writes to both, reads from Rank Math first)
- **Neither** (falls back to `_forge_seo_*` generic meta so nothing is lost)

## Why this exists

Neither Yoast nor Rank Math registers its post meta as `show_in_rest = true`,
so a standard `POST /wp-json/wp/v2/posts/123` will **silently drop** every SEO
field. This plugin registers a dedicated, authenticated REST namespace and
translates between Forge's normalized `SeoConfig` payload and the underlying
plugin's raw meta keys.

## Installation

1. Download or clone this folder.
2. Zip the `forge-seo-connector` directory:
   `zip -r forge-seo-connector.zip forge-seo-connector`
3. In WordPress admin → **Plugins → Add New → Upload Plugin** → choose the zip.
4. Activate.
5. Create an **Application Password**: WP admin → **Users → Profile →
   Application Passwords** → enter a name (e.g. "Forge") → **Add New**.
6. Copy the generated password. Enter your site URL, username, and that
   password in the Forge **WordPress** dialog.

## Endpoints

All endpoints live under `/wp-json/forge-seo/v1/` and require Basic Auth via
a WordPress Application Password.

| Method | Path | Description |
|---|---|---|
| `GET` | `/status` | Reports active SEO plugins + versions |
| `GET` | `/seo?post_id=N` | Read normalized SEO for a post |
| `POST` | `/seo?post_id=N` | Write normalized SEO for a post (body = SeoConfig JSON) |
| `GET` | `/posts?per_page=20&page=1&search=foo` | List posts with their normalized SEO |

## Normalized SEO payload (matches Forge's `SeoConfig`)

```json
{
  "title": "My Page — SiteName",
  "description": "Rendered meta description",
  "focusKeyword": "website builder",
  "keywords": "website builder, drag and drop, seo",
  "canonical": "https://example.com/my-page",
  "robots": "index, follow",
  "ogTitle": "My Page",
  "ogDescription": "Social description",
  "ogImage": "https://example.com/og.jpg",
  "ogType": "website",
  "twitterCard": "summary_large_image",
  "twitterSite": "@mysite",
  "twitterTitle": "My Page",
  "twitterDescription": "Social description",
  "twitterImage": "https://example.com/twitter.jpg",
  "jsonLd": "{ \"@context\": \"https://schema.org\", \"@type\": \"WebSite\" }",
  "author": "Jane Doe",
  "lang": "en"
}
```

## Field mapping

| Normalized | Yoast meta key | Rank Math meta key |
|---|---|---|
| title | `_yoast_wpseo_title` | `rank_math_title` |
| description | `_yoast_wpseo_metadesc` | `rank_math_description` |
| focusKeyword | `_yoast_wpseo_focuskw` | `rank_math_focus_keyword` |
| canonical | `_yoast_wpseo_canonical` | `rank_math_canonical_url` |
| robots | `_yoast_wpseo_meta-robots-noindex` + `-nofollow` | `rank_math_robots` (array) |
| ogTitle | `_yoast_wpseo_opengraph-title` | `rank_math_facebook_title` |
| ogDescription | `_yoast_wpseo_opengraph-description` | `rank_math_facebook_description` |
| ogImage | `_yoast_wpseo_opengraph-image` | `rank_math_facebook_image` |
| twitterTitle | `_yoast_wpseo_twitter-title` | `rank_math_twitter_title` |
| twitterDescription | `_yoast_wpseo_twitter-description` | `rank_math_twitter_description` |
| twitterImage | `_yoast_wpseo_twitter-image` | `rank_math_twitter_image` |
| jsonLd | `_yoast_wpseo_schema_article_type` | `rank_math_schema_Article` |

## Security

- Every endpoint requires Application Password Basic Auth.
- Read needs the `edit_posts` capability.
- Write needs `edit_post` for the specific post being modified.
- All input is sanitized; only the allow-listed fields above are accepted.
- App passwords are scoped per user — create a dedicated "Forge" user with
  the Author or Editor role for least privilege.

## License

GPL-2.0-or-later.
