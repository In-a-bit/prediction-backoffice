/**
 * Polymarket Gamma API utilities for the backoffice.
 *
 * Used to:
 *  1. Extract the Polymarket slug stored in a deploy-plan note.
 *  2. Fetch resolution data for a slug from Gamma.
 *  3. Match a Polymarket market to an internal market by question text.
 */

import type {
  PolymarketEventResolution,
  PolymarketMarketResolution,
} from "./types";

export const GAMMA_API = "https://gamma-api.polymarket.com";

// Pattern used when creating events via the from-slug form.
// Example note: "From Polymarket slug: us-x-iran-permanent-peace-deal-by"
const SLUG_NOTE_RE = /From Polymarket slug:\s*(\S+)/i;

/**
 * Extract the Polymarket event slug from a deploy-plan `note` field.
 * Returns null when the plan was not created from a slug.
 */
export function extractPolymarketSlug(note: string | null | undefined): string | null {
  if (!note) return null;
  return SLUG_NOTE_RE.exec(note)?.[1] ?? null;
}

/**
 * Fetch the full resolution state for a Polymarket event slug.
 * Makes a single call to `gamma-api.polymarket.com/events/slug/:slug`.
 *
 * Throws on network/parse errors so the caller can handle degradation.
 */
export async function fetchSlugResolution(
  slug: string,
): Promise<PolymarketEventResolution> {
  const url = `${GAMMA_API}/events/slug/${encodeURIComponent(slug)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Gamma API returned ${res.status} for slug "${slug}": ${await res.text().catch(() => res.statusText)}`,
    );
  }
  const raw = (await res.json()) as GammaEvent;

  return {
    slug,
    gammaUrl: url,
    markets: (raw.markets ?? []).map(normalizeMarket),
  };
}

/**
 * Find the Polymarket market that corresponds to an internal market by
 * normalising and comparing question text.
 */
export function matchPolymarketMarket(
  question: string | null | undefined,
  pmMarkets: PolymarketMarketResolution[],
): PolymarketMarketResolution | null {
  if (!question) return null;
  const norm = normaliseQuestion(question);
  return (
    pmMarkets.find((m) => normaliseQuestion(m.question) === norm) ?? null
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normaliseQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeMarket(m: GammaMarket): PolymarketMarketResolution {
  return {
    slug: m.slug ?? "",
    question: m.question ?? "",
    umaResolutionStatus: m.umaResolutionStatus ?? null,
    umaResolutionStatuses: parseJsonArray(m.umaResolutionStatuses),
    outcomePrices: parseJsonArray(m.outcomePrices),
    outcomes: parseJsonArray(m.outcomes),
    questionId: m.questionID ?? null,
    conditionId: m.conditionId ?? null,
    umaEndDate: m.umaEndDate ?? null,
    customLiveness: m.customLiveness ?? null,
    umaBond: m.umaBond ?? null,
    automaticallyResolved: Boolean(m.automaticallyResolved),
  };
}

/**
 * Gamma encodes arrays as JSON strings in some fields (e.g. `"[\"Yes\",\"No\"]"`).
 * Accept both real arrays and stringified arrays.
 */
function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Not valid JSON — return as single-element array if non-empty.
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Gamma API raw shapes (only the fields we consume).
// ---------------------------------------------------------------------------

type GammaEvent = {
  markets?: GammaMarket[];
};

type GammaMarket = {
  slug?: string;
  question?: string;
  conditionId?: string;
  questionID?: string;
  umaResolutionStatus?: string;
  umaResolutionStatuses?: string | string[];
  outcomePrices?: string | string[];
  outcomes?: string | string[];
  umaEndDate?: string;
  customLiveness?: string;
  umaBond?: string;
  automaticallyResolved?: boolean;
};
