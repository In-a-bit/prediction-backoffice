import { NextRequest, NextResponse } from "next/server";

import { dpm } from "@/lib/api";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ external_id: string }> },
) {
  try {
    const { external_id } = await ctx.params;
    const data = await dpm.activateEvent(external_id);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
