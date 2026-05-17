import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const season = Number.parseInt(req.nextUrl.searchParams.get("season") ?? "", 10);
    if (!Number.isFinite(season)) {
      return NextResponse.json({ error: "season is required" }, { status: 400 });
    }
    const country = req.nextUrl.searchParams.get("country") ?? undefined;
    const type = req.nextUrl.searchParams.get("type") ?? undefined;
    const data = await sports.listAllLeagues(season, { country, type });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
