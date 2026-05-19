import { NextRequest, NextResponse } from "next/server";

import { dpm, manual } from "@/lib/api";

// Backoffice convenience: accept external_id, resolve to dpm numeric id,
// then call /events/:id/pause (which requires the numeric id).
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ external_id: string }> },
) {
  try {
    const { external_id } = await ctx.params;
    const event = await manual.getEventByExternalId(external_id);
    const data = await dpm.pauseEvent(event.id);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
