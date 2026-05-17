import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const body = (await req.json()) as { actor?: string; market_type_key?: string };
    if (!body?.market_type_key) {
      return NextResponse.json({ error: "market_type_key is required" }, { status: 400 });
    }
    const data = await sports.addMarketType(id, body.market_type_key, { actor: body.actor });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
