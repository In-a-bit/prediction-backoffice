import { NextResponse } from "next/server";

import { manual } from "@/lib/api";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ external_id: string }> },
) {
  const { external_id } = await ctx.params;
  try {
    const data = await manual.retryOperatorLog(external_id);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
