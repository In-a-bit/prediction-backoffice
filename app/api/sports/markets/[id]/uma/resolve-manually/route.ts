import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      actor?: string;
      payouts?: string[];
    };
    if (!Array.isArray(body?.payouts) || body.payouts.length === 0) {
      return NextResponse.json(
        { error: "payouts must be a non-empty array of strings" },
        { status: 400 },
      );
    }
    const data = await sports.umaResolveManually(id, body.payouts, {
      actor: body?.actor,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
