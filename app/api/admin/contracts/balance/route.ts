import { NextRequest, NextResponse } from "next/server";

import { contracts } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Proxies the Go backoffice (/proxy/dpm/{native,collateral}/balance), which
// enforces wallets.read. Used by the Contracts page to show the Treasury
// contract's live on-chain POL + USDC.e balance.
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  try {
    const data = await contracts.getBalances(address);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
