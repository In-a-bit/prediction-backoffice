import { NextRequest, NextResponse } from "next/server";

import { BackofficeApiError, manual } from "@/lib/api";
import { proxyError } from "@/lib/route-guard";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  try {
    const data = await manual.getSeriesBySlug(slug);
    return NextResponse.json(data);
  } catch (err) {
    // 404 is the expected "no such series" answer, not a failure — callers use
    // it to decide whether a slug is free. Anything else is a real error and
    // keeps its upstream status.
    if (err instanceof BackofficeApiError && err.status === 404) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return proxyError(err);
  }
}
