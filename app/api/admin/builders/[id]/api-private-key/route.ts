import { NextRequest, NextResponse } from "next/server";

import { builders } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// POST issues the secret key a custody builder's own backend authenticates with.
// dpm-api refuses when the builder is embedded, or already holds an active key.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idRaw } = await ctx.params;
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const data = await builders.createPrivateKey(id);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
