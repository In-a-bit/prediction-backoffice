import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";
import type { CreateDeployPlanInput } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateDeployPlanInput;
    if (!body?.event_external_id) {
      return NextResponse.json(
        { error: "event_external_id is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.markets) || body.markets.length === 0) {
      return NextResponse.json(
        { error: "markets must be a non-empty array" },
        { status: 400 },
      );
    }
    const data = await manual.createDeployPlan(body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  try {
    const data = await manual.listDeployPlans({
      event_external_id: params.get("event_external_id") ?? undefined,
      status: params.get("status") ?? undefined,
      limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
