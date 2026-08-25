import { NextRequest, NextResponse } from "next/server";

import { builders } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

// POST revokes the builder's active secret key without issuing a replacement,
// leaving its backend unable to authenticate until a new key is created.
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
    const data = await builders.revokePrivateKey(id);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
