import { NextRequest, NextResponse } from "next/server";

import {
  builders,
  type BuilderType,
  type CreateBuilderInput,
} from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

function builderTypeFrom(raw: string | null): BuilderType | undefined {
  return raw === "custody" || raw === "embedded" ? raw : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params: {
      search?: string;
      builder_type?: BuilderType;
      limit?: number;
      offset?: number;
    } = {};
    if (sp.get("search")) params.search = sp.get("search") ?? undefined;
    const builderType = builderTypeFrom(sp.get("builder_type"));
    if (builderType) params.builder_type = builderType;
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
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const builderType = body.builder_type === "custody" ? "custody" : "embedded";
    const input =
      builderType === "custody"
        ? custodyInput(body.name.trim())
        : embeddedInput(body.name.trim(), body);
    if ("error" in input) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }
    const data = await builders.create(input);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return proxyError(err);
  }
}

// A custody builder carries no wallet-provider field: dpm-api rejects the request
// outright if one is present, so none is forwarded even when the client sent it.
function custodyInput(name: string): CreateBuilderInput {
  return { name, builder_type: "custody" };
}

function embeddedInput(
  name: string,
  body: Partial<CreateBuilderInput>,
): CreateBuilderInput | { error: string } {
  const walletPublicKey = body.wallet_public_key?.trim();
  const walletSecretKey = body.wallet_secret_key?.trim();
  if (!walletPublicKey || !walletSecretKey) {
    return {
      error:
        "wallet_public_key and wallet_secret_key are required for an embedded builder",
    };
  }
  return {
    name,
    builder_type: "embedded",
    wallet_public_key: walletPublicKey,
    wallet_secret_key: walletSecretKey,
    wallet_verification_key: body.wallet_verification_key?.trim() || undefined,
    // The provider the existing onboarding form collects credentials for.
    wallet_type: "privy_proxy",
  };
}
