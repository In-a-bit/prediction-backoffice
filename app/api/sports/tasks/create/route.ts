import { NextRequest, NextResponse } from "next/server";

import { sports } from "@/lib/api";
import type { CreateSportTaskInput } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateSportTaskInput;
    if (!body?.sport_key || !body?.api_league_id || !body?.api_season || !body?.league_slug) {
      return NextResponse.json(
        { error: "sport_key, api_league_id, api_season, league_slug are required" },
        { status: 400 },
      );
    }
    if (!body.market_type_keys || body.market_type_keys.length === 0) {
      return NextResponse.json(
        { error: "market_type_keys must be non-empty" },
        { status: 400 },
      );
    }
    const data = await sports.createTask(body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
