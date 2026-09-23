import { NextRequest, NextResponse } from "next/server";

import { builders } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

type UpdateBuilderBody = {
  paybis_api_key?: string;
  paybis_private_key?: string;
  paybis_provider_public_key?: string;
};

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
    const body = (await req.json()) as UpdateBuilderBody;
    const patch: UpdateBuilderBody = {};
    if (body.paybis_api_key?.trim()) patch.paybis_api_key = body.paybis_api_key.trim();
    if (body.paybis_private_key?.trim()) patch.paybis_private_key = body.paybis_private_key.trim();
    if (body.paybis_provider_public_key?.trim()) {
      patch.paybis_provider_public_key = body.paybis_provider_public_key.trim();
    }
    if (!patch.paybis_api_key && !patch.paybis_private_key && !patch.paybis_provider_public_key) {
      return NextResponse.json(
        { error: "no fields to update" },
        { status: 400 },
      );
    }
    const data = await builders.update(id, patch);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}
