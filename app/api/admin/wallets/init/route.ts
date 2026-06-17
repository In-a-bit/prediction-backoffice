import { NextRequest, NextResponse } from "next/server";

import { admin, type WalletType } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { type?: WalletType; label?: string };
    if (!body?.type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }
    const data = await admin.initRelayerWallet({ type: body.type, label: body.label });
    return NextResponse.json(data, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
