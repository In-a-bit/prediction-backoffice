import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { slug?: string; label?: string };
    const slug = body.slug?.trim();
    const label = body.label?.trim();
    if (!slug || !label) {
      return NextResponse.json(
        { error: "slug and label are required" },
        { status: 400 },
      );
    }
    const data = await manual.upsertTag(slug, label);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
