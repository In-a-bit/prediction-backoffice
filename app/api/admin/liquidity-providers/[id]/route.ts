import { NextRequest, NextResponse } from "next/server";

import { liquidityProviders, type UpdateLiquidityProviderInput } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const body = (await req.json()) as UpdateLiquidityProviderInput;
    const data = await liquidityProviders.update(id, body);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
