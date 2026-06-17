import { NextRequest, NextResponse } from "next/server";

import { admin, audit } from "@/lib/api";
import { ensurePermission } from "@/lib/route-guard";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const denied = await ensurePermission("wallets.admin");
    if (denied) return denied;

    const { id: idStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be an integer" }, { status: 400 });
    }
    const data = await admin.deactivateRelayerWallet(id);
    await audit.record({ action: "wallet.deactivate", resource_type: "wallet", resource_id: idStr, result_status: 200 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
