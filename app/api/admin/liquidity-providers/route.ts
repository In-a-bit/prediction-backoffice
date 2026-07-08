import { NextRequest, NextResponse } from "next/server";

import {
  liquidityProviders,
  type CreateLiquidityProviderInput,
} from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params: {
      name?: string;
      email?: string;
      limit?: number;
      offset?: number;
    } = {};
    if (sp.get("name")) params.name = sp.get("name") ?? undefined;
    if (sp.get("email")) params.email = sp.get("email") ?? undefined;
    const limit = sp.get("limit");
    const offset = sp.get("offset");
    if (limit) params.limit = Number.parseInt(limit, 10);
    if (offset) params.offset = Number.parseInt(offset, 10);
    const data = await liquidityProviders.list(params);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateLiquidityProviderInput>;
    if (!body?.name?.trim() || !body?.email?.trim()) {
      return NextResponse.json({ error: "name and email are required" }, { status: 400 });
    }
    const data = await liquidityProviders.create({
      name: body.name.trim(),
      email: body.email.trim(),
      max_addresses: body.max_addresses,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return proxyError(err);
  }
}
