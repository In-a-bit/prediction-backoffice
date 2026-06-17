import { NextRequest, NextResponse } from "next/server";

import { admin, audit, type WithdrawPayload } from "@/lib/api";
import { ensurePermission } from "@/lib/route-guard";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // Bypasses Go — enforce + audit in the BFF.
    const denied = await ensurePermission("treasury.withdraw");
    if (denied) return denied;

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
    await audit.record({
      action: "wallet.withdraw",
      resource_type: "wallet",
      resource_id: idStr,
      params: { asset: body.asset, to: body.to, max: body.max ?? false, amount_raw: body.amount_raw },
      result_status: 200,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
