import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

// POST /api/manual/events/:external_id/tags — attach a tag (by slug) to an
// existing event. Proxied to the Go backoffice, which upserts the tag in
// dpm-api and then creates the event_tag join row.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ external_id: string }> },
) {
  try {
    const { external_id } = await ctx.params;
    const body = (await req.json()) as { slug?: string; label?: string };
    const slug = body.slug?.trim().toLowerCase();
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }
    const data = await manual.attachEventTag(
      external_id,
      slug,
      body.label?.trim() || slug,
    );
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
