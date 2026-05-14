import { NextResponse } from "next/server";

import { manual } from "@/lib/api";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ external_id: string }> },
) {
  const { external_id } = await ctx.params;
  if (!external_id) {
    return NextResponse.json(
      { error: "external_id is required" },
      { status: 400 },
    );
  }
  try {
    const data = await manual.getMarketStatus(external_id);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
