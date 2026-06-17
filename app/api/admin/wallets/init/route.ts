import { NextRequest, NextResponse } from "next/server";

import { admin, audit, type WalletType } from "@/lib/api";
import { ensurePermission } from "@/lib/route-guard";

export async function POST(req: NextRequest) {
  try {
    const denied = await ensurePermission("wallets.admin");
    if (denied) return denied;

    const body = (await req.json()) as { type?: WalletType; label?: string };
    if (!body?.type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }
    const data = await admin.initRelayerWallet({ type: body.type, label: body.label });
    await audit.record({
      action: "wallet.init",
      resource_type: "wallet",
      params: { type: body.type, label: body.label },
      result_status: 202,
    });
    return NextResponse.json(data, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
