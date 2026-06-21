import { NextRequest, NextResponse } from "next/server";

import { BackofficeApiError, contracts, type CreateContractInput } from "@/lib/api";

// Both routes proxy the Go backoffice (/proxy/dpm/contracts), which enforces
// RBAC (wallets.read for list, wallets.admin for create) and audits the write.
// We forward the upstream status so 401/403/409 surface to the client as-is.
function errorResponse(err: unknown): NextResponse {
  if (err instanceof BackofficeApiError) {
    return NextResponse.json({ error: err.body || err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const data = await contracts.list();
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
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
    return errorResponse(err);
  }
}
