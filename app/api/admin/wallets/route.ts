import { NextRequest, NextResponse } from "next/server";

import { admin, type RelayerWalletListParams } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/relayer-wallets), which enforces
// wallets.read. proxyError forwards the upstream status.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params: RelayerWalletListParams = {};
    const limit = sp.get("limit");
    const offset = sp.get("offset");
    if (limit) params.limit = Number.parseInt(limit, 10);
    if (offset) params.offset = Number.parseInt(offset, 10);
    if (sp.get("address")) params.address = sp.get("address") ?? undefined;
    if (sp.get("wallet_type")) params.wallet_type = sp.get("wallet_type") ?? undefined;
    if (sp.get("label")) params.label = sp.get("label") ?? undefined;

    const data = await admin.listRelayerWallets(params);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
