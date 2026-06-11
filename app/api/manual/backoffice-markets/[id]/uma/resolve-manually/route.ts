import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as { payouts?: string[]; actor?: string };
    if (!Array.isArray(body?.payouts) || body.payouts.length === 0) {
      return NextResponse.json({ error: "payouts array required" }, { status: 400 });
    }
    const data = await manual.manualUmaResolveManually(id, body.payouts, { actor: body?.actor });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
