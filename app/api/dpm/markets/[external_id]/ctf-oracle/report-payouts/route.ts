import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ external_id: string }> },
) {
  try {
    const { external_id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { payouts?: string[] };
    if (!Array.isArray(body?.payouts) || body.payouts.length === 0) {
      return NextResponse.json(
        { error: "payouts must be a non-empty array of strings" },
        { status: 400 },
      );
    }
    const data = await manual.ctfOracleReportPayouts(external_id, body.payouts);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
