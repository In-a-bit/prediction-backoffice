import { NextResponse } from "next/server";

import { admin, audit } from "@/lib/api";
import { ensurePermission } from "@/lib/route-guard";

export async function POST() {
  try {
    const denied = await ensurePermission("wallets.admin");
    if (denied) return denied;

    const data = await admin.initMnemonic();
    await audit.record({ action: "wallet.mnemonic_init", resource_type: "wallet", result_status: 200 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
