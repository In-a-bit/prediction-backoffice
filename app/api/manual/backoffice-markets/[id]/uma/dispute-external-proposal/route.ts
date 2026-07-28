import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

// Challenges an outside proposal immediately: the backoffice broadcasts
// disputePriceFor from the UMA_ADMIN wallet and logs the decision, which is what
// tells the dispute-watch to stand down rather than send a second dispute.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const audit = await req.json().catch(() => ({}));
    const data = await manual.disputeExternalProposal(id, audit);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
