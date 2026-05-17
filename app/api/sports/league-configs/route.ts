import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const sportKey = req.nextUrl.searchParams.get("sport_key") ?? undefined;
    const data = await sports.listLeagueConfigs(sportKey);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
