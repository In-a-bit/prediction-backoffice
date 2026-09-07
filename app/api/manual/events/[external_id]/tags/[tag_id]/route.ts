import { NextRequest, NextResponse } from "next/server";

import { manual } from "@/lib/api";

// DELETE /api/manual/events/:external_id/tags/:tag_id — detach a tag from an
// existing event. Idempotent: detaching a tag that isn't attached succeeds.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ external_id: string; tag_id: string }> },
) {
  try {
    const { external_id, tag_id } = await ctx.params;
    const tagId = Number(tag_id);
    if (!Number.isInteger(tagId)) {
      return NextResponse.json({ error: "invalid tag_id" }, { status: 400 });
    }
    await manual.detachEventTag(external_id, tagId);
    return NextResponse.json({});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
