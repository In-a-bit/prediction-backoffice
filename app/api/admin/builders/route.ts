import { NextRequest, NextResponse } from "next/server";

import { builders, type CreateBuilderInput } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params: { search?: string; limit?: number; offset?: number } = {};
    if (sp.get("search")) params.search = sp.get("search") ?? undefined;
    const limit = sp.get("limit");
    const offset = sp.get("offset");
    if (limit) params.limit = Number.parseInt(limit, 10);
    if (offset) params.offset = Number.parseInt(offset, 10);
    const data = await builders.list(params);
    return NextResponse.json(data);
  } catch (err) {
    return proxyError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateBuilderInput>;
    if (
      !body?.name?.trim() ||
      !body?.wallet_public_key?.trim() ||
      !body?.wallet_secret_key?.trim()
    ) {
      return NextResponse.json(
        { error: "name, wallet_public_key, and wallet_secret_key are required" },
        { status: 400 },
      );
    }
    const data = await builders.create({
      name: body.name.trim(),
      wallet_public_key: body.wallet_public_key.trim(),
      wallet_secret_key: body.wallet_secret_key.trim(),
      wallet_verification_key: body.wallet_verification_key?.trim() || undefined,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return proxyError(err);
  }
}
