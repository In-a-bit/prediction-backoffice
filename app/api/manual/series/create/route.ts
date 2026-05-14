import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";
import type { ManualAudit, SeriesPayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ManualAudit & { payload: SeriesPayload };
    const { payload, ...audit } = body;
    if (!payload?.slug || !payload?.title) {
      return NextResponse.json(
        { error: "payload.slug and payload.title are required" },
        { status: 400 },
      );
    }
    const data = await manual.createSeries(payload, audit);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
