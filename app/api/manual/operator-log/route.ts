import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";
import type { OperatorLogFilters } from "@/lib/types";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const filters: OperatorLogFilters = {};
  const resourceType = params.get("resource_type");
  if (resourceType === "series" || resourceType === "event" || resourceType === "market") {
    filters.resource_type = resourceType;
  }
  const action = params.get("action");
  if (action) filters.action = action as OperatorLogFilters["action"];
  const actor = params.get("actor");
  if (actor) filters.actor = actor;
  const correlationId = params.get("correlation_id");
  if (correlationId) filters.correlation_id = correlationId;
  const status = params.get("status");
  if (status) filters.status = status as OperatorLogFilters["status"];
  const limit = params.get("limit");
  if (limit) filters.limit = Number(limit);

  try {
    const data = await manual.listOperatorLog(filters);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
