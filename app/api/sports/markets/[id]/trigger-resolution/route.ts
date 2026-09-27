import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as { proposed_price?: string };
    if (!body?.proposed_price) {
      return NextResponse.json({ error: "proposed_price required" }, { status: 400 });
    }
    const data = await sports.triggerResolution(id, body.proposed_price);
    return NextResponse.json(data);
  } catch (err) {
    // Keep the upstream status: a 400 (price not allowed), 403 (missing
    // permission) or 409 (proposal replaced) is the operator's answer, not a crash.
    return proxyError(err);
  }
}
