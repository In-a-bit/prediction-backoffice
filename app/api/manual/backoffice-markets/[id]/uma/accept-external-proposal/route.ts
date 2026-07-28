import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

// Records the operator's decision to let an outside proposal settle. Nothing
// goes on-chain here — the running dispute-watch reads the operator_logs row on
// its next poll and waits out liveness instead of disputing.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const audit = await req.json().catch(() => ({}));
    const data = await manual.acceptExternalProposal(id, audit);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
