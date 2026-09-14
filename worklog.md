# Worklog — Forge: Lightweight Website Builder

Project: A lightweight website design & development tool with three editing modes
(Drag & Drop, Hybrid, Custom Code), a floating AI assistant bubble, and a
comprehensive SEO toolkit.

Tech: Next.js 16 (App Router), TypeScript, Tailwind 4, shadcn/ui, @dnd-kit,
zustand, z-ai-web-dev-sdk (LLM), react-syntax-highlighter.

---
Task ID: 1
Agent: main
Task: Define the foundation — types, block registry, SEO analysis utilities,
zustand store (persisted to localStorage), and AI context helper.

Work Log:
- Inspected existing project (package.json, prisma schema, globals.css).
- Confirmed @dnd-kit/core, react-syntax-highlighter, zustand, z-ai-web-dev-sdk are installed.
- Decided to keep canvas state in zustand+localStorage (lightweight, no DB round-trips).
- Will create: src/lib/types.ts, src/lib/blocks.ts, src/lib/seo.ts, src/lib/store.ts, src/lib/ai-context.ts

Stage Summary:
- (in progress)
---
Task ID: 2-a
Agent: full-stack-developer
Task: Build the AI backend API routes that power the floating AI assistant and SEO suggestions, using z-ai-web-dev-sdk (LLM skill). Stateless route handlers — no Prisma/DB.

Work Log:
- Read worklog.md (Task 1, in progress) to confirm foundation types exist.
- Inspected `src/lib/types.ts` (BlockType, BlockProps, BlockStyle, Block, SeoConfig, ChatMessage), `src/lib/ai-context.ts` (buildPageContext, blocksToHtml), `src/lib/blocks.ts` (BLOCK_DEFINITIONS, createBlock), and `src/lib/seo.ts` (DEFAULT_SEO, analyzeSeo, extractContentText) to align generated blocks/SEO with the existing data model.
- Inspected `node_modules/z-ai-web-dev-sdk/dist/index.d.ts` to confirm the SDK surface: `ZAI.create()` static async factory, `zai.chat.completions.create({ messages, thinking })` returns `{ choices: [{ message: { content } }] }`. Confirmed thinking `{ type: "disabled" }` is valid.
- Inspected `eslint.config.mjs`: strict rules like `no-explicit-any` and `no-unused-vars` are off, but kept the code `any`-free anyway using proper types from `@/lib/types`.
- Created `src/lib/llm.ts`:
  - Lazy singleton `getZai()` with in-flight promise dedup so concurrent first calls share one construction.
  - `llmChat(messages)` helper that calls `zai.chat.completions.create` with `thinking: { type: "disabled" }` and returns the first choice's content string (or "").
- Created `src/app/api/ai/chat/route.ts` (POST):
  - Body `{ messages, context? }`. System primer "Forge AI" is sent as the FIRST message with role "assistant" per the project's LLM contract, then the optional page-context note (also role "assistant"), then the user-supplied history verbatim.
  - System prompt documents the ```forge-action fenced JSON protocol (add_blocks / update_seo), enumerates valid BlockType values, and requires exactly one action block at the end (or none).
  - Returns `{ reply }` on success, 400 on missing/invalid body, 500 with `{ error }` if the SDK throws.
- Created `src/app/api/ai/generate-block/route.ts` (POST):
  - Body `{ prompt, context }`. Strict JSON-array generator system prompt listing every block type with its relevant props and Tailwind style guidance (real Unsplash image URLs required).
  - Defensive parsing: `stripFences` removes ```json fences; `extractJsonArray` performs a brace/bracket-aware scan to recover the largest balanced `[ ... ]` even when the model prepends prose. Each item's `type` is validated against `BLOCK_DEFINITIONS`; invalid items are silently dropped.
  - Returns `{ blocks: BlockSpec[] }`. 400 on missing prompt, 502 with `{ error, raw }` if model output is not a JSON array.
- Created `src/app/api/ai/seo-suggest/route.ts` (POST):
  - Body `{ seo: SeoConfig, contentText }`. SEO consultant system prompt asks for a single JSON object with title (≤60), description (70-160), focusKeyword, keywords, ogTitle, ogDescription, compact jsonLd (WebSite/Organization), and 3-5 tips.
  - Same `stripFences` + `extractJsonObject` brace-aware recovery. Coerces each field to its expected type; `tips` validated as a string array and truncated to 5 items.
  - Graceful degradation: if JSON parse fails or the result isn't an object, returns 200 with `{ raw }` so the client can display the raw text.
- Ran `bun run lint` from the project root: exit code 0, zero errors/warnings on the four new files (and the whole repo).
- Verified `dev.log` shows the dev server is healthy (200s on `/`); no compile errors introduced.

Files created:
- `src/lib/llm.ts`
- `src/app/api/ai/chat/route.ts`
- `src/app/api/ai/generate-block/route.ts`
- `src/app/api/ai/seo-suggest/route.ts`

Stage Summary:
- AI backend layer complete and lint-clean. The floating assistant (Task for another agent) can POST to `/api/ai/chat` with `{ messages, context }` and parse any trailing ```forge-action block; "generate" UI flows can POST to `/api/ai/generate-block`; the SEO panel can POST to `/api/ai/seo-suggest` and either apply the returned object or fall back to `{ raw }`. The ZAI client is instantiated lazily and cached module-level — only one construction per server process. All routes are Node runtime (no `runtime = "edge"`), stateless, and use `Response.json(...)`. z-ai-web-dev-sdk is imported only in server code (llm.ts → route handlers), never reaching the client bundle.

---
Task ID: 3-9
Agent: main
Task: Build the full builder UI (TopBar, LeftPanel, Canvas w/ dnd-kit,
Properties, comprehensive SEO panel, floating AI assistant, code editor for
Hybrid/Custom Code modes, Preview + Export), compose the main page, sticky
footer, responsive polish, and run end-to-end self-verification with
Agent Browser.

Work Log:
- Created `src/components/builder/BlockRenderer.tsx` — renders each BlockType
  (nav, hero, heading, paragraph, button, image, card, features, quote, cta,
  divider, spacer, footer) with Tailwind classes derived from Block.style.
- Created `src/components/builder/CanvasBlock.tsx` — sortable block wrapper
  with a hover/selected toolbar (drag handle, move up/down, duplicate, delete).
- Created `src/components/builder/Canvas.tsx` — DndContext + SortableContext;
  palette items are useDraggable, the canvas root is useDroppable, and blocks
  are useSortable. DragEnd handles both "drop palette item -> add block" and
  "reorder existing block". Includes a DragOverlay.
- Created `src/components/builder/LeftPanel.tsx` — searchable, categorized
  block palette (layout/content/media/marketing) with draggable items + click-
  to-add chips, plus an "Generate with AI" prompt box that POSTs to
  /api/ai/generate-block and appends the returned blocks.
- Created `src/components/builder/TopBar.tsx` — 3-mode switcher
  (Drag&Drop / Hybrid / Custom Code), device preview switcher (desktop/tablet/
  mobile), Preview toggle, Export dropdown (HTML, SEO JSON, robots.txt,
  sitemap.xml), project name input, Reset.
- Created `src/components/builder/PropertiesPanel.tsx` — adapts the editing
  fields to the selected block type (text, level, links list, features list,
  button variant, image src/alt, etc.) + a Style editor (align, bg, padding,
  rounded, extra class).
- Created `src/components/builder/SeoPanel.tsx` — the SEO centerpiece: live
  score ring, 17 weighted SEO checks (pass/warn/fail), stats (word count,
  keyword density, readability, title/desc length, images w/o alt, heading
  counts), SERP preview, and 5 tabs: Checks / Meta / Social / Schema / Files.
  Meta tab edits title/description/focus keyword/keywords/canonical/robots/
  author/lang. Social tab edits OG + Twitter cards with a live social card
  preview. Schema tab edits JSON-LD with Organization/WebSite/FAQ templates.
  Files tab shows generated robots.txt + sitemap.xml with copy buttons.
  Includes an "AI Optimize SEO" button that POSTs to /api/ai/seo-suggest.
- Created `src/components/builder/RightPanel.tsx` — tabs SEO Tools / Properties.
- Created `src/components/builder/CodeView.tsx` — read-only CodeView (Prism
  oneDark), editable CodeEditor (transparent textarea over SyntaxHighlighter),
  and HybridPanel (canvas top + live generated HTML bottom).
- Created `src/components/builder/CustomCodePanel.tsx` — full-width editable
  HTML editor with a Tailwind-loaded live preview iframe toggle.
- Created `src/components/builder/Preview.tsx` — clean, toolbar-free render of
  the page (blocks or custom-code iframe) respecting the device width.
- Created `src/components/builder/Footer.tsx` — sticky status bar showing
  block count, current mode, and live SEO score (color-coded).
- Created `src/components/ai/FloatingAssistant.tsx` — framer-motion floating
  bubble (bottom-right, animated, ping indicator) + chat panel with markdown
  rendering, quick-action chips, typing indicator, and forge-action parsing
  that auto-applies add_blocks / update_seo to the store.
- Composed `src/app/page.tsx` — full-height flex layout: TopBar, main area
  (Drag&Drop/Hybrid use react-resizable-panels with LeftPanel|Canvas|RightPanel;
  Custom Code is full-width), sticky Footer, FloatingAssistant. LeftPanel hides
  below md with a landscape hint.
- Updated `src/app/layout.tsx` — SEO-rich metadata, wired the Sonner toaster
  (replacing the radix toaster used elsewhere).
- Updated `src/app/globals.css` — added `.chat-markdown` styling (since
  @tailwindcss/typography is not installed) + thin custom scrollbars.
- Cleaned up unused imports/code in Canvas, LeftPanel, Preview.
- `bun run lint` -> 0 errors, 0 warnings across the whole repo.

Self-verification (Agent Browser):
- Opened http://localhost:3000 — page renders with title "Forge — Lightweight
  Website Builder with AI & SEO". TopBar, LeftPanel palette, Canvas with 5
  default blocks (nav, hero, features, cta, footer) each with drag/move/
  duplicate/delete toolbars, and the SEO Tools tab all present.
- Clicked the floating bubble -> chat panel opened with greeting + 4 quick
  actions + input.
- Clicked "Add a pricing section" quick action -> AI replied and emitted a
  forge-action that added a pricing heading block to the canvas (block count
  5 -> 7). End-to-end LLM + canvas mutation confirmed.
- Switched to Hybrid mode -> canvas (top) + live generated HTML code (bottom)
  showing all SEO meta tags, OG tags, Twitter cards, JSON-LD, and rendered
  block HTML.
- Switched to Custom Code mode -> editable code editor with the starter HTML,
  plus a "Live preview" toggle.
- Clicked "AI Optimize SEO" -> SEO score rose 68 -> 76/100 and an "AI TIPS"
  list appeared. End-to-end SEO optimization confirmed.
- Checked browser errors/console -> no page errors (only a harmless dnd-kit
  aria-describedby React warning + Fast Refresh logs).
- Sticky footer status bar shows live "7 blocks | Mode: Dragdrop | SEO score:
  76/100 | Forge Builder".
- Mobile viewport (390x844) -> LeftPanel hides, canvas + SEO panel still
  render, landscape hint shown. Responsive confirmed.

Stage Summary:
- All requested features implemented and browser-verified:
  1. Drag & Drop builder (dnd-kit, sortable, palette, per-block toolbar).
  2. Hybrid mode (visual canvas + live HTML code panel).
  3. Custom Code mode (editable HTML editor + live preview iframe).
  4. Floating AI assistant bubble (framer-motion, LLM chat, auto-applies
     add_blocks / update_seo via a forge-action protocol).
  5. Full SEO toolkit (score + 17 checks, meta, OG/Twitter social preview,
     JSON-LD schema, robots.txt, sitemap.xml, SERP preview, AI optimize).
- Plus: device preview switcher, HTML/SEO/robots/sitemap export, sticky
  status-bar footer, responsive layout, Sonner toasts.
- Lint clean, dev server healthy, no runtime errors in the browser.
