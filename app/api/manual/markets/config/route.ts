import { NextResponse } from "next/server";

import { manual } from "@/lib/api";

// Proxies manual.getMarketConfig() — the market editor's UMA bond/reward
// default+max hints (BACKOFFICE_UMA_BOND/BACKOFFICE_MAX_UMA_BOND/
// BACKOFFICE_UMA_REWARD/BACKOFFICE_MAX_UMA_REWARD). "use client" components
// can't import lib/api.ts directly (server-only), so this thin proxy is the
// only way the client-side MarketEditor can fetch it.
export async function GET() {
  try {
    const data = await manual.getMarketConfig();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
