# Forge AI

> A lightweight, AI-powered website builder with **three editing modes** (Drag & Drop, Hybrid, Custom Code), a **floating AI assistant**, a **full SEO toolkit** (Yoast + RankMath scoring), **E-E-A-T analysis**, **internal-link suggestions**, a **WordPress connector** with live two-way SEO sync, an **MCP server** for external agents, and a **multi-tasking orchestration dashboard**.

Built on Next.js 16 + React 19 + Tailwind 4 + shadcn/ui + @dnd-kit + Prisma. Vercel-ready.

---

## What is Forge AI?

Forge AI is a visual website builder that lets you design, code, and optimize landing pages — with an AI co-pilot that can generate blocks, write copy, and improve your SEO in real time. It also doubles as an **agent orchestration platform**: a multi-tasking runner, a Model Context Protocol (MCP) server, and a WordPress connector that bridges Yoast and Rank Math SEO plugins.

### Three editing modes

| Mode | What it is |
|---|---|
| **Drag & Drop** | A `@dnd-kit` sortable block canvas — drag from the palette, reorder, edit properties in the right panel. |
| **Hybrid** | The visual canvas on top + a live syntax-highlighted HTML view below that updates as you edit. |
| **Custom Code** | A full editable HTML editor (Prism highlighting) with a live preview iframe; Tailwind is auto-loaded. |

### The floating AI assistant

A framer-motion animated bubble (bottom-right) that opens a chat panel. It uses the active LLM provider and can **automatically mutate your canvas** — ask "Add a pricing section" and it generates + inserts blocks via a `forge-action` protocol. It can also update your SEO config straight from chat.

### Full SEO toolkit

- **SEO Score** — 17 weighted checks (title length, description, focus keyword, density, H1 count, heading structure, word count, image alt, OG tags, Twitter card, canonical, JSON-LD, robots, readability)
- **E-E-A-T Score** — 4-dimension analyzer (Experience, Expertise, Authoritativeness, Trustworthiness) with 13 checks + AI narrative
- **Internal Linking** — AI finds contextual link opportunities with anchor text + target + reason + Apply button
- **Yoast + RankMath scoring** — in-memory replication of both plugins' readability + focus-keyword matrices (`src/modules/wordpress/scoring.ts`)
- **Meta / Social / Schema / Files** tabs — edit title, description, OG, Twitter, JSON-LD, and generate `robots.txt` + `sitemap.xml`

### WordPress connector

- **Publish** your page to WordPress as a draft/publish/private post
- **Import** an existing WP post → converts HTML to editable Forge blocks + loads live Yoast/RankMath SEO
- **Live SEO Sync** — pull from / push to a WP post's SEO meta via the unified Forge SEO Connector plugin
- **Plugin included** — `src/modules/wordpress/plugin/` is a PHP plugin that detects Yoast/RankMath/both/none and exposes a normalized `/forge-seo/v1` REST namespace

### Multi-tasking agent runner

An in-process concurrent worker (`CONCURRENCY=3`) that picks up queued tasks and runs them with the active LLM provider. Six task kinds: `audit_seo`, `generate_page`, `optimize_meta`, `internal_links`, `publish_wp`, `custom`. The dashboard live-polls every 2s.

### MCP server

A Model Context Protocol server at `/api/mcp` exposes **14 tools** (`forge_list_projects`, `forge_add_block`, `forge_update_seo`, `forge_analyze_seo`, `forge_generate_blocks`, `forge_create_task`, …) + 2 resources + 1 prompt. External agents (Claude Desktop, Cline, Cursor, n8n MCP nodes) can drive Forge projects over the standard Streamable HTTP transport.

### Pluggable LLM providers

Route LLM calls to the active provider — z-ai cloud (default), OpenAI-compatible (Ollama, LM Studio, vLLM), or the opencode CLI. Point the provider at `http://<laptop-ip>:11434/v1` with model `llama3.1:8b` and all AI calls run on a local model for free.

### n8n integration

Bidirectional: n8n calls `POST /api/n8n/webhook` to create Forge tasks; Forge can `POST /api/n8n/trigger` to run heavy n8n workflows.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Drag & drop | `@dnd-kit/core` v6 + `@dnd-kit/sortable` v10 |
| Layout | `react-resizable-panels` |
| Animation | `framer-motion` v12 |
| State | `zustand` v5 (persisted to localStorage) |
| Code highlighting | `react-syntax-highlighter` (Prism, oneDark) |
| Database | Prisma ORM (SQLite client) |
| AI backend | `z-ai-web-dev-sdk` + pluggable providers |
| MCP | `@modelcontextprotocol/sdk` |
| Toasts | `sonner` |

---

## Project structure

```
Forge-AI/
├── src/
│   ├── app/
│   │   ├── page.tsx                      # Builder + Dashboard view switcher
│   │   ├── layout.tsx                   # Root layout + Sonner toaster
│   │   └── api/
│   │       ├── ai/                       # chat, generate-block, seo-suggest, eeat, internal-links
│   │       ├── mcp/                      # MCP server (14 tools)
│   │       ├── projects/                 # Server-side project CRUD
│   │       ├── tasks/                    # Multi-tasking agent queue
│   │       ├── providers/                # Pluggable LLM provider config
│   │       ├── n8n/                      # webhook + trigger
│   │       └── wordpress/               # test, publish, posts, import, sync, seo-sync, seo-status
│   ├── components/
│   │   ├── builder/                      # TopBar, Canvas, panels, WordPressDialog, etc.
│   │   ├── dashboard/                    # OrchestrationDashboard
│   │   ├── ai/                           # FloatingAssistant
│   │   └── ui/                           # shadcn/ui components
│   ├── lib/
│   │   ├── store.ts                      # Zustand store (persisted)
│   │   ├── seo.ts                        # 17-check SEO analyzer
│   │   ├── eeat.ts                       # 4-dimension E-E-A-T scorer
│   │   ├── providers.ts                  # Pluggable LLM provider abstraction
│   │   ├── task-runner.ts                # Concurrent multi-tasking runner
│   │   ├── mcp-server.ts                 # MCP tool/resource/prompt registry
│   │   ├── html-to-blocks.ts             # WP import HTML→Block[] converter
│   │   └── wordpress.ts                  # wpBasicAuth + wpUrl helpers
│   └── modules/
│       └── wordpress/                    # Unified Yoast + RankMath module
│           ├── scoring.ts                # In-memory Yoast + RankMath scoring engine
│           ├── index.ts                  # Barrel export
│           └── plugin/                   # The PHP plugin (for distribution)
│               ├── forge-seo-connector.php
│               ├── includes/{class-detector,class-mapper,class-rest}.php
│               └── uninstall.php
├── prisma/schema.prisma                  # Project, AgentTask, ProviderConfig, N8nConfig
├── package.json                          # Vercel-ready: "prisma generate && next build"
├── push_to_github.py                     # Git automation script
└── .gitignore                            # Excludes .env, *.db, node_modules, .next
```

---

## Quick start

### 1. Install dependencies

```bash
bun install
# or
npm install
```

### 2. Set up the database

```bash
# .env should contain:
# DATABASE_URL="file:./db/custom.db"

bun run db:push    # creates the SQLite tables
```

### 3. Run the dev server

```bash
bun run dev
# → http://localhost:3000
```

### 4. Deploy to Vercel

1. Push to GitHub (use `push_to_github.py` or your own flow)
2. Import the repo at [vercel.com](https://vercel.com) — Vercel auto-detects Next.js
3. The build script (`prisma generate && next build`) runs automatically
4. Set `DATABASE_URL` + any `z-ai-web-dev-sdk` keys in Vercel env vars
5. (Optional) Switch `prisma/schema.prisma` provider from `sqlite` to `postgresql` for production

---

## Key APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ai/chat` | POST | Floating assistant LLM chat (with `forge-action` canvas mutations) |
| `/api/ai/generate-block` | POST | AI generates blocks from a text prompt |
| `/api/ai/seo-suggest` | POST | AI optimizes SEO meta |
| `/api/ai/eeat` | POST | AI E-E-A-T narrative analysis |
| `/api/ai/internal-links` | POST | AI internal-link suggestions |
| `/api/mcp` | POST | MCP server (initialize, tools/list, tools/call) |
| `/api/projects` | GET/POST | List / create server-side projects |
| `/api/projects/[id]` | GET/PUT/DELETE | Project CRUD |
| `/api/tasks` | GET/POST | List / enqueue agent tasks |
| `/api/tasks/[id]` | GET/DELETE | Task detail / cancel |
| `/api/providers` | GET/POST | List / add LLM providers |
| `/api/providers/[id]/activate` | POST | Set active provider |
| `/api/providers/test` | POST | Health-check a provider |
| `/api/wordpress/test` | POST | Test WP connection |
| `/api/wordpress/publish` | POST | Publish blocks to WP |
| `/api/wordpress/import` | POST | Import WP post → Forge blocks |
| `/api/wordpress/sync` | POST | In-memory Yoast+RankMath scoring + optional WP push |
| `/api/wordpress/seo-sync` | POST | Bidirectional SEO proxy to the WP plugin |
| `/api/n8n/webhook` | POST | n8n → Forge (creates a task) |
| `/api/n8n/trigger` | POST | Forge → n8n (runs an n8n workflow) |

---

## The 13 block types

The drag-drop canvas palette (defined in `src/lib/blocks.ts`):

| Category | Blocks |
|---|---|
| Layout | `nav`, `card`, `divider`, `spacer`, `footer` |
| Marketing | `hero`, `features`, `cta` |
| Content | `heading` (H1-H6), `paragraph`, `button`, `quote` |
| Media | `image` |

Each block has `props` (content) + `style` (Tailwind classes: align, background, padding, rounded, extraClass).

---

## The WordPress connector plugin

The PHP plugin in `src/modules/wordpress/plugin/` (zip it and upload via WP Admin → Plugins → Add New → Upload) provides:

| Endpoint | Method | Purpose |
|---|---|---|
| `/wp-json/forge-seo/v1/status` | GET | Reports active SEO plugins (Yoast/RankMath/both/none) |
| `/wp-json/forge-seo/v1/seo?post_id=N` | GET | Read normalized SEO for a post |
| `/wp-json/forge-seo/v1/seo?post_id=N` | POST | Write normalized SEO to a post |
| `/wp-json/forge-seo/v1/posts` | GET | List posts with their SEO |

It auto-detects Yoast (`_yoast_wpseo_*` meta) and Rank Math (`rank_math_*` meta), translates between the two, and writes to both if both are active. Requires a WordPress Application Password (Basic Auth).

---

## Configuration

### Pluggable LLM providers

Add providers in the **Dashboard → Providers** tab. Supported types:
- `zai` — z-ai cloud (default fallback)
- `openai_compat` — Ollama / LM Studio / vLLM / OpenRouter (e.g. `http://localhost:11434/v1`)
- `opencode` — opencode CLI agent

### WordPress credentials

Stored in the browser (localStorage) via the **WordPress** dialog. Never sent to the Forge DB — passed per-request to the proxy routes.

---

## Scripts

```bash
bun run dev          # dev server on :3000
bun run build        # prisma generate && next build (Vercel-ready)
bun run start        # production server
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun run db:push      # push Prisma schema to SQLite
```

---

## License

MIT.
