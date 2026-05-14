import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";
import type { ManualAudit, MarketPayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ManualAudit & { payload: MarketPayload };
    const { payload, ...audit } = body;
    if (!payload?.question) {
      return NextResponse.json(
        { error: "payload.question is required" },
        { status: 400 },
      );
    }
    if (!payload?.event_id && !payload?.event_external_id) {
      return NextResponse.json(
        { error: "payload.event_id or payload.event_external_id is required" },
        { status: 400 },
      );
    }
    const data = await manual.createMarket(payload, audit);
    return NextResponse.json(data, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
