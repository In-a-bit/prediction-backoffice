import { NextRequest, NextResponse } from "next/server";
import { fetchSlugResolution } from "@/lib/polymarket";

/**
 * GET /api/polymarket/slug-resolution?slug=<polymarket-slug>
 *
 * Server-side proxy to Gamma API so the Polymarket URL stays on the server
 * and client components can poll without CORS issues.
 *
 * Returns: PolymarketEventResolution JSON
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug query param is required" }, { status: 400 });
  }

  try {
    const data = await fetchSlugResolution(slug);
    return NextResponse.json(data, {
      headers: {
        // Allow the client to cache for 60 s; server revalidates from Gamma.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[polymarket/slug-resolution] error", { slug, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
