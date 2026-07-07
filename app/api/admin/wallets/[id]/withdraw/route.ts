import { NextRequest, NextResponse } from "next/server";

import { admin, type WithdrawPayload } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/relayer-wallets/:id/withdraw), which
// enforces treasury.withdraw (highest-harm) and audits the write.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const body = (await req.json()) as WithdrawPayload;
    if (!body?.asset || !body?.to) {
      return NextResponse.json({ error: "asset and to are required" }, { status: 400 });
    }
    if (!body.max && !body.amount_raw) {
      return NextResponse.json({ error: "amount_raw is required unless max=true" }, { status: 400 });
    }
    const data = await admin.withdrawFromRelayerWallet(id, body);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
