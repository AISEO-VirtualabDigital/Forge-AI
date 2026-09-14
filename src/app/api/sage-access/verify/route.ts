// GET /api/sage-access/verify
//
// Verify that a Sage access token is valid. Sage calls this after pairing
// to confirm the token works. Returns { valid: boolean }.

import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json(
      { valid: false, error: "No token provided. Use: Authorization: Bearer <token>" },
      { status: 401 },
    );
  }

  const config = await db.n8nConfig.findUnique({ where: { id: "singleton" } });

  if (!config?.apiKey) {
    return NextResponse.json(
      { valid: false, error: "No access token configured. Call POST /api/sage-access/generate first." },
      { status: 404 },
    );
  }

  const valid = token === config.apiKey;

  return NextResponse.json({
    valid,
    project: "forge-ai",
    hint: config.apiKey.slice(0, 8) + "…",
  }, { status: valid ? 200 : 403 });
}
