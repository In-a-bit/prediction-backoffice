import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";

// Accepts both POST (from controls UI) and DELETE for symmetry with the
// backend's DELETE /sports/league-configs/:id/market-types/:type_id route.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; type_id: string }> }) {
  return remove(ctx);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; type_id: string }> }) {
  return remove(ctx);
}

async function remove(ctx: { params: Promise<{ id: string; type_id: string }> }) {
  try {
    const { id: idStr, type_id: typeIdStr } = await ctx.params;
    const id = Number.parseInt(idStr, 10);
    const typeId = Number.parseInt(typeIdStr, 10);
    if (!Number.isFinite(id) || !Number.isFinite(typeId)) {
      return NextResponse.json({ error: "id and type_id must be integers" }, { status: 400 });
    }
    const data = await sports.removeMarketType(id, typeId);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
