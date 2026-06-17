import { NextResponse } from "next/server";

import { admin } from "@/lib/api";

export async function GET() {
  try {
    const data = await admin.getMnemonicStatus();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
