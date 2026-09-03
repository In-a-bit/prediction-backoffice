import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const sport = req.nextUrl.searchParams.get("sport") ?? "";
    if (!sport) {
      return NextResponse.json({ error: "sport is required" }, { status: 400 });
    }
    const data = await sports.listSeasons(sport);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
