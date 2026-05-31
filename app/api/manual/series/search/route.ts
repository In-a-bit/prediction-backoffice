import { NextRequest, NextResponse } from "next/server";

import { BackofficeApiError, manual } from "@/lib/api";

// Proxy to manual.searchSeries (Phase 5 backend carve-out). When the Go
// endpoint isn't deployed yet, the upstream request 404s; in that case we
// gracefully fall back to manual.getSeriesBySlug so an exact slug still
// resolves and the UI degrades to the legacy behaviour without breaking.

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(50, Number(limitRaw))) : 8;
  if (!q) return NextResponse.json([], { status: 200 });

  try {
    const results = await manual.searchSeries(q, limit);
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof BackofficeApiError && err.status === 404) {
      // Endpoint not implemented yet — try slug-exact lookup as a degraded
      // path so single-keystroke matches still work.
      try {
        const single = await manual.getSeriesBySlug(q);
        return NextResponse.json([single]);
      } catch (slugErr) {
        if (slugErr instanceof BackofficeApiError && slugErr.status === 404) {
          return NextResponse.json([]);
        }
        return NextResponse.json(
          { error: slugErr instanceof Error ? slugErr.message : String(slugErr) },
          { status: 502 },
        );
      }
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
