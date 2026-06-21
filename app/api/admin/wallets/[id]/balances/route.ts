import { NextRequest, NextResponse } from "next/server";

import { admin } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/relayer-wallets/:id/balances), which
// enforces wallets.read.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const data = await admin.getRelayerWalletBalances(id);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
