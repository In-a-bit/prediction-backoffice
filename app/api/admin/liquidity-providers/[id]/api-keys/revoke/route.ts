import { NextRequest, NextResponse } from "next/server";

import { liquidityProviders } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// PATCH revokes the provider's active API key without issuing a replacement.
export async function PATCH(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const data = await liquidityProviders.revokeKey(id);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
