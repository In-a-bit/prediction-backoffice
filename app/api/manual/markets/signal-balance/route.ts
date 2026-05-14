import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { workflow_id?: string };
    const workflowId = body.workflow_id?.trim();
    if (!workflowId) {
      return NextResponse.json(
        { error: "workflow_id is required" },
        { status: 400 },
      );
    }
    const data = await manual.signalMarketBalance(workflowId);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
