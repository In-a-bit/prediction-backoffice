import { NextResponse } from "next/server";

import { manual } from "@/lib/api";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; pos: string }> },
) {
  const { id, pos } = await ctx.params;
  try {
    const data = await manual.recreatePlanMarket(id, Number(pos));
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
