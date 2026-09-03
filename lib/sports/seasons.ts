// Season helpers shared by every sport. Fetching is identical across sports —
// the backoffice endpoint takes the sport as a parameter and each provider
// asks its own vendor — so only the rendering differs, and that stays in the
// per-sport module.

// fetchSeasonsFor asks this app's proxy route for a sport's season tokens,
// newest first. Browser-only: the URL is relative.
export async function fetchSeasonsFor(sportKey: string): Promise<string[]> {
  const res = await fetch(`/api/sports/leagues/seasons?sport=${encodeURIComponent(sportKey)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`seasons fetch failed — status ${res.status}: ${body || "(empty body)"}`);
  }
  const data = (await res.json()) as string[] | null;
  return Array.isArray(data) ? data : [];
}

// formatStartYearSeason renders a token that means "the campaign starting in
// this year" as the two years it spans, e.g. "2025" -> "2025/2026". Used by the
// sports whose vendor reports nothing but start years.
//
// A token that isn't a bare year is shown as the vendor spelled it: the season
// list comes from the vendor itself, so an unexpected shape is a vendor change
// to read, not a value to hide behind an em dash.
export function formatStartYearSeason(season: string | null | undefined): string {
  if (!season) return "—";
  const year = Number.parseInt(season, 10);
  if (!Number.isFinite(year) || String(year) !== season) return season;
  return `${year}/${year + 1}`;
}
