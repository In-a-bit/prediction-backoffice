import { NextRequest, NextResponse } from "next/server";

import { admin } from "@/lib/api";
import { ensurePermission } from "@/lib/route-guard";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await ensurePermission("wallets.read");
    if (denied) return denied;

    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const data = await admin.getRelayerWalletBalances(id);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
