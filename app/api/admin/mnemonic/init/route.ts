import { NextResponse } from "next/server";

import { admin } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/relayer-wallets/mnemonic/init), which
// enforces wallets.admin and audits the write.
export async function POST() {
  try {
    const data = await admin.initMnemonic();
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
