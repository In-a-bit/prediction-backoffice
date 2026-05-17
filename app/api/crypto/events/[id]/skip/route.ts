import { NextRequest, NextResponse } from "next/server";

import { crypto as cryptoApi } from "@/lib/api";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as { actor?: string };
    const data = await cryptoApi.skipCryptoEvent(id, { actor: body?.actor });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
