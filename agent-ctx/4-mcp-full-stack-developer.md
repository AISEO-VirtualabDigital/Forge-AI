# Task 4-mcp — MCP (Model Context Protocol) server for Forge

**Agent:** full-stack-developer
**Date:** 2026-09-14
**Status:** ✅ Complete

## What was built

An MCP server at `/api/mcp` that exposes Forge's builder + SEO + EEAT + agent
capabilities as typed tools/resources/prompts over the standard Streamable
HTTP transport, so external clients (Claude Desktop, Cline, Cursor, n8n MCP
nodes, the `mcp` CLI) can drive Forge projects.

## Files created/modified

- `package.json` — added `@modelcontextprotocol/sdk@1.30.0` (zod@4.3.5 already present).
- `src/lib/mcp-server.ts` (NEW, ~750 lines, server-only) — the MCP server factory:
  - Static `TOOL_DEFS` table with all 14 tools (name + Zod schema + handler).
  - `buildForgeMcpServer()` registers 14 tools + 2 URI-template resources + 1 prompt.
  - `getForgeMcpServer()` — factory called per HTTP request (returns fresh server).
  - `listAllTools()` — catalog accessor for the dashboard's tool-catalog widget.
  - `withDefaultSeo()` helper that merges partial SEO against `DEFAULT_SEO` so
    the analyzers/renderer never crash on undefined fields.
- `src/app/api/mcp/route.ts` (NEW, ~170 lines) — POST/GET/DELETE/OPTIONS handlers:
  - `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
  - Uses `WebStandardStreamableHTTPServerTransport` (NOT the Node.js variant
    which expects IncomingMessage/ServerResponse — Next.js gives us a Web
    Standard `Request`).
  - Stateless mode (`sessionIdGenerator: undefined`) + `enableJsonResponse: true`.
  - Pre-parses body for controlled error handling, passes via `parsedBody`.
  - Supports both single-message and batch JSON-RPC.
  - GET → 405 (stateless has no SSE stream).
  - DELETE → 200 OK (stateless has no session to terminate).
  - OPTIONS → 204 with permissive CORS headers.
- `worklog.md` — appended task record.

## 14 tools registered

| # | Tool | Input | Output |
|---|------|-------|--------|
| 1 | `forge_list_projects` | — | `[{id,name,slug,mode,blockCount,updatedAt}]` |
| 2 | `forge_get_project` | `{projectId}` | full project (blocks, seo, mode, customCode) |
| 3 | `forge_create_project` | `{name, blocks?, seo?}` | `{projectId}` (SEO merged vs DEFAULT_SEO) |
| 4 | `forge_update_blocks` | `{projectId, blocks}` | `{ok, blockCount}` |
| 5 | `forge_add_block` | `{projectId, type, props?, style?, index?}` | `{blockId, blockCount}` |
| 6 | `forge_update_seo` | `{projectId, seo}` | `{seo: merged}` |
| 7 | `forge_analyze_seo` | `{projectId}` | `{seoScore, eeatScore, wordCount, failingChecks, eeatChecks}` |
| 8 | `forge_generate_blocks` | `{projectId, prompt}` | `{added, types}` (LLM) |
| 9 | `forge_export_html` | `{projectId}` | `{html}` |
| 10 | `forge_create_task` | `{projectId, kind, title?, input?}` | `{taskId, status}` (+ ensureRunner) |
| 11 | `forge_list_tasks` | `{projectId}` | recent tasks |
| 12 | `forge_get_task` | `{taskId}` | full task (input, output, logs) |
| 13 | `forge_list_providers` | — | providers (apiKey masked as `•••••`) |
| 14 | `forge_set_active_provider` | `{providerId}` | `{ok:true}` (+ invalidateProvider) |

## 2 resources (URI templates)

- `forge://project/{id}/context` → markdown page context (buildPageContext output)
- `forge://project/{id}/blocks`  → current Block[] as JSON

## 1 prompt

- `forge_page_audit` (`{projectId}`) → user-role message embedding the page
  context + instructions to produce a prioritized action list referencing
  Forge tools.

## Key architectural decisions

1. **Web Standard transport, not Node.js transport.** Next.js App Router
   route handlers receive Web Standard `Request` objects. The Node.js
   `StreamableHTTPServerTransport` expects `IncomingMessage`/`ServerResponse`
   and would require a `@hono/node-server` bridge — unnecessary plumbing.
   `WebStandardStreamableHTTPServerTransport.handleRequest(req: Request)`
   returns a `Response` directly.

2. **Stateless per-request server.** A NEW `McpServer` is built per HTTP
   request because the SDK's `Protocol.connect()` throws "Already connected"
   if the same server is reconnected. This matches the official SDK stateless
   example (`simpleStatelessStreamableHttp`). `sessionIdGenerator: undefined`
   + `enableJsonResponse: true` keep responses simple JSON.

3. **Static `TOOL_DEFS` table.** Serves both `listAllTools()` (dashboard
   catalog) and `buildForgeMcpServer()` (per-request server). No duplication
   between the catalog and the actual handlers.

4. **`withDefaultSeo()` everywhere SEO is read.** The downstream analyzers
   and HTML renderer assume a complete `SeoConfig` and crash on undefined
   fields (`seo.jsonLd.trim()`). The dashboard client always seeds from
   `DEFAULT_SEO`, but MCP tools accept arbitrary partial patches — so every
   DB read of SEO runs through `withDefaultSeo(readSeo(...))`.

## Verification

- `bun run lint` → 0 errors, 0 warnings. ✅
- `npx tsc --noEmit` → no MCP-related type errors. ✅
- In-process e2e test (bun script simulating JSON-RPC dispatch):
  - `initialize` → 200, serverInfo `forge-mcp@1.0.0`, protocol 2025-06-18.
  - `tools/list` → 14 tools with correct schemas.
  - `tools/call forge_create_project` → created, returned projectId.
  - `tools/call forge_add_block` (hero) → inserted, returns {blockId, blockCount}.
  - `tools/call forge_update_seo` (partial) → merged 3 fields + 12 defaults = 15.
  - `tools/call forge_analyze_seo` → scores + failing-checks (no crash).
  - `tools/call forge_export_html` → full HTML doc with head meta + body.
  - `tools/call forge_create_task` (audit_seo) → enqueued; runner picked up.
  - `tools/call forge_get_task` → full task (input, output, logs).
  - `tools/call forge_list_providers` → [] (correct), masked apiKey shown when present.
  - `resources/read forge://project/{id}/context` → markdown page context.
  - `resources/read forge://project/{id}/blocks` → JSON Block[].
  - `resources/templates/list` → both templates listed.
  - `prompts/get forge_page_audit` → user-role message with embedded context.
  - `prompts/list` → lists prompt with `projectId` argument.
  - Batch JSON-RPC (2 messages in one request) → array of 2 responses with correct IDs.
  - Error path: `forge_get_project` with nonexistent ID → `{ isError: true, content: [{type:"text", text:"Project not found: ..."}] }`.

## Curl example for external clients

```bash
curl -X POST 'https://<your-forge-host>/api/mcp' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

Expected response (truncated):
```json
{"result":{"protocolVersion":"2025-06-18","capabilities":{"logging":{},"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"listChanged":true}},"serverInfo":{"name":"forge-mcp","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

## Notes for next agent

- The dashboard can call `listAllTools()` from `src/lib/mcp-server.ts` to
  render the 14-tool catalog.
- The route handler is stateless — no session state is persisted between
  requests. For a stateful mode (SSE streaming, server-initiated
  notifications), switch to `sessionIdGenerator: () => crypto.randomUUID()`
  and drop `enableJsonResponse`. The transport tracks sessions in-memory so
  requests must be pinned to the same process (sticky sessions behind a LB).
- The task runner is booted on the first POST via `ensureRunner()` — so any
  `forge_create_task` call sees a live queue-drainer.
- `forge_generate_blocks` uses the active LLM provider (z-ai cloud by
  default, fall back to whatever `ProviderConfig` row is marked active).
- All tools return structured JSON stringified as MCP text content
  (`{ content: [{ type: "text", text: JSON.stringify(result) }] }`).
