// GET /api/sage-access/status
//
// Check if Forge AI has a Sage access token configured (without revealing it).

import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const config = await db.n8nConfig.findUnique({ where: { id: "singleton" } });
  const hasToken = !!config?.apiKey;

  return NextResponse.json({
    project: "forge-ai",
    has_access_token: hasToken,
    hint: hasToken ? config!.apiKey.slice(0, 8) + "…" : null,
    sage_can_monitor: hasToken,
  });
}
