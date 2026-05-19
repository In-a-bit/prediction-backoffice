import { NextRequest, NextResponse } from "next/server";

import { dpm, manual } from "@/lib/api";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ external_id: string }> },
) {
  try {
    const { external_id } = await ctx.params;
    const verdict = await manual.getMarketStatus(external_id);
    if (!verdict.market?.id) {
      return NextResponse.json(
        { error: "market not yet on-chain — no numeric id available" },
        { status: 409 },
      );
    }
    const data = await dpm.pauseMarket(verdict.market.id);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
