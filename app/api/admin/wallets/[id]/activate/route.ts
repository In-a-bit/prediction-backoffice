import { NextRequest, NextResponse } from "next/server";

import { admin } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/relayer-wallets/:id/activate), which
// enforces wallets.admin and audits the write.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const data = await admin.activateRelayerWallet(id);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
