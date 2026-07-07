import { NextResponse } from "next/server";

import { admin } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/relayer-wallets/mnemonic), which
// enforces wallets.read. proxyError forwards the upstream status.
export async function GET() {
  try {
    const data = await admin.getMnemonicStatus();
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
