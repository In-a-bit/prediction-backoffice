import { NextRequest, NextResponse } from "next/server";

import { contracts, type CreateContractInput } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// Both routes proxy the Go backoffice (/proxy/dpm/contracts), which enforces
// RBAC (wallets.read for list, wallets.admin for create) and audits the write.
// proxyError forwards the upstream status so 401/403/409 surface to the client.

export async function GET() {
  try {
    const data = await contracts.list();
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateContractInput>;
    if (!body?.address || !body?.name || !body?.contract_type) {
      return NextResponse.json(
        { error: "address, name and contract_type are required" },
        { status: 400 },
      );
    }
    const data = await contracts.create({
      address: body.address,
      name: body.name,
      contract_type: body.contract_type,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return proxyError(err);
  }
}
