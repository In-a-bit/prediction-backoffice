import { NextRequest, NextResponse } from "next/server";

import { builders, type UpdateBuilderInput } from "@/lib/api";
import { paybisFields } from "@/lib/builders";
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
    const body = (await req.json()) as UpdateBuilderInput;
    const patch = paybisFields(body);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }
    const data = await builders.update(id, patch);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
