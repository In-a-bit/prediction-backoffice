import { NextResponse } from "next/server";

import { admin } from "@/lib/api";
import { ensurePermission } from "@/lib/route-guard";

export async function GET() {
  try {
    const denied = await ensurePermission("wallets.read");
    if (denied) return denied;

    const data = await admin.getMnemonicStatus();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
