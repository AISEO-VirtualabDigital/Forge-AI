// /api/mcp — Forge MCP server endpoint (Streamable HTTP transport).
//
// Implements the MCP Streamable HTTP transport so external clients (Claude
// Desktop, Cline, Cursor, n8n MCP nodes, the `mcp` CLI) can drive Forge
// projects via standard JSON-RPC over HTTP.
//
// Pattern (stateless — per the official SDK example
// `simpleStatelessStreamableHttp`):
//   - Each POST builds a fresh McpServer + fresh transport, connects them,
//     dispatches the JSON-RPC message, and returns the Response.
//   - `sessionIdGenerator: undefined` → stateless mode (no session tracking),
//     which is the simplest robust setup for a Next.js route handler and
//     works with the widest range of clients.
//   - `enableJsonResponse: true` → responses are plain JSON (no SSE), so the
//     route handler can simply return the Response from the transport without
//     holding a stream open.
//
// GET and DELETE return JSON-RPC error responses with 405/200 respectively
// (stateless mode has no SSE stream to serve and no session to terminate).
//
// runtime = "nodejs" (NOT edge) so the Prisma client + node:crypto etc work.
// dynamic = "force-dynamic" so Next never caches JSON-RPC responses.

// Note: we use `WebStandardStreamableHTTPServerTransport` (not the Node.js
// `StreamableHTTPServerTransport`) because Next.js App Router route handlers
// receive Web Standard `Request` objects. The Web Standard transport's
// `handleRequest(req: Request)` returns a `Response` directly — exactly what a
// Next.js route handler needs. The Node.js variant expects IncomingMessage +
// ServerResponse and would not work here.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getForgeMcpServer } from "@/lib/mcp-server";
import { ensureRunner } from "@/lib/task-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// JSON-RPC error response helper (used by GET/DELETE).
function jsonRpcError(code: number, message: string, status = 405): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

/**
 * POST /api/mcp
 *
 * Accepts a single JSON-RPC message (object) or a batch (array). Dispatches
 * through a fresh McpServer + StreamableHTTPServerTransport and returns the
 * resulting JSON-RPC response.
 *
 * Example `initialize` call:
 *   curl -X POST /api/mcp \
 *     -H 'content-type: application/json' \
 *     -H 'accept: application/json, text/event-stream' \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
 */
export async function POST(req: Request): Promise<Response> {
  // Boot the background task runner so any `forge_create_task` call sees a
  // live queue-drainer (cheap + idempotent).
  ensureRunner();

  // Parse the incoming JSON-RPC body up front so we control the error path
  // (a non-JSON body never reaches the transport's own parser).
  let body: unknown;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return jsonRpcError(-32700, "Parse error: invalid JSON", 400);
  }
  if (body === null) {
    return jsonRpcError(-32600, "Invalid Request: empty body", 400);
  }

  // Build a fresh server + transport per request (stateless pattern).
  const server = getForgeMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
  } catch (err) {
    const message = err instanceof Error ? err.message : "connect failed";
    return jsonRpcError(-32603, `Internal error: ${message}`, 500);
  }

  // The transport accepts a Web Standard Request and returns a Web Standard
  // Response. We hand it the original `req` so it sees headers (notably
  // `accept` and `mcp-protocol-version`) and the body, with our pre-parsed
  // body passed via `parsedBody` so it isn't re-read.
  let response: Response;
  try {
    response = await transport.handleRequest(req, { parsedBody: body });
  } catch (err) {
    const message = err instanceof Error ? err.message : "handleRequest failed";
    return jsonRpcError(-32603, `Internal error: ${message}`, 500);
  }

  // Attach CORS headers so browser-based MCP clients can call us directly.
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "POST, GET, DELETE, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "content-type, accept, mcp-protocol-version, mcp-session-id",
  );
  headers.set("access-control-expose-headers", "mcp-session-id");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * GET /api/mcp
 *
 * In stateless mode there is no SSE stream to subscribe to. Return 405 with a
 * JSON-RPC error per the spec.
 */
export async function GET(): Promise<Response> {
  return jsonRpcError(
    -32000,
    "Method not allowed: this MCP server runs in stateless mode (no SSE GET stream). Use POST for JSON-RPC.",
    405,
  );
}

/**
 * DELETE /api/mcp
 *
 * In stateless mode there is no session to terminate. Return 200 OK so
 * well-behaved clients that send a terminating DELETE on shutdown get a clean
 * acknowledgement.
 */
export async function DELETE(): Promise<Response> {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", result: { ok: true }, id: null }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

/**
 * OPTIONS /api/mcp — respond to CORS preflight.
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
      "access-control-allow-headers":
        "content-type, accept, mcp-protocol-version, mcp-session-id",
      "access-control-expose-headers": "mcp-session-id",
      "access-control-max-age": "86400",
    },
  });
}
