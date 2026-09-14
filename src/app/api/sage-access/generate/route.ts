// POST /api/sage-access/generate
//
// Forge AI generates an access token that Sage can use to monitor + talk
// to it. This is the reverse interconnect: instead of Sage hardcoding
// access, Forge AI controls its own token.
//
// The token is stored in the N8nConfig singleton row (reusing the existing
// config storage) under a `sage_access_token` field. Returns the token
// ONCE — subsequent calls return the existing token (or a new one if
// `rotate=true` is passed).

import { db } from "@/lib/db";
import { NextResponse } from "next/server";

function generateToken(): string {
  // 32-byte URL-safe token (same entropy as the Sage remote-control token).
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function POST(req: Request): Promise<NextResponse> {
  let rotate = false;
  try {
    const body = await req.json();
    rotate = Boolean(body.rotate);
  } catch {
    // body is optional
  }

  // Read the existing config row.
  const existing = await db.n8nConfig.findUnique({ where: { id: "singleton" } });

  // Check if a token already exists (unless rotate=true).
  if (!rotate && existing?.apiKey) {
    // We store the Sage access token in the N8nConfig.apiKey field (reusing
    // the singleton). In a production setup you'd add a dedicated column.
    // For now, return the existing token so the operator can re-fetch it.
    return NextResponse.json({
      ok: true,
      token: existing.apiKey,
      note: "Token already exists. Pass {rotate: true} to generate a new one.",
      project: "forge-ai",
    });
  }

  // Generate a new token.
  const token = generateToken();

  // Upsert the config with the new token.
  await db.n8nConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      apiKey: token,
      enabled: true,
    },
    update: {
      apiKey: token,
    },
  });

  return NextResponse.json({
    ok: true,
    token,
    project: "forge-ai",
    note: "Store this token. Use it in the Authorization header when Sage calls Forge AI: 'Bearer <token>'",
  }, { status: 201 });
}
