import { NextRequest, NextResponse } from "next/server";

import { admin, type WalletType } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/relayer-wallets/init), which enforces
// wallets.admin and audits the write.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { type?: WalletType; label?: string };
    if (!body?.type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }
    const data = await admin.initRelayerWallet({ type: body.type, label: body.label });
    return NextResponse.json(data, { status: 202 });
  } catch (err) {
    return proxyError(err);
  }
}
