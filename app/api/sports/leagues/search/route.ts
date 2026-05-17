import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    if (!q) {
      return NextResponse.json({ error: "q is required" }, { status: 400 });
    }
    const season = Number.parseInt(req.nextUrl.searchParams.get("season") ?? "", 10);
    const data = await sports.searchLeagues(q, Number.isFinite(season) ? season : undefined);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
