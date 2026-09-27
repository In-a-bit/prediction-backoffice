import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Records the operator's decision to let an outside proposal on a sport market
// settle. Nothing goes on-chain here — the running dispute-watch reads the
// operator_logs row on its next poll and waits out liveness instead of disputing.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const audit = await req.json().catch(() => ({}));
    const data = await sports.acceptExternalProposal(id, audit);
    return NextResponse.json(data);
  } catch (err) {
    // Keep the upstream status: a 400 (price not allowed), 403 (missing
    // permission) or 409 (proposal replaced) is the operator's answer, not a crash.
    return proxyError(err);
  }
}
