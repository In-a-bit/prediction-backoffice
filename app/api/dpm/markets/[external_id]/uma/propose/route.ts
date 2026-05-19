import { NextRequest, NextResponse } from "next/server";

import { dpm } from "@/lib/api";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ external_id: string }> },
) {
  try {
    const { external_id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      proposer_address?: string;
      proposed_price?: string;
    };
    if (!body?.proposer_address) {
      return NextResponse.json({ error: "proposer_address required" }, { status: 400 });
    }
    if (!body?.proposed_price) {
      return NextResponse.json({ error: "proposed_price required" }, { status: 400 });
    }
    const data = await dpm.umaPropose(external_id, body.proposer_address, body.proposed_price);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
