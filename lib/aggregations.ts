// Pure aggregation helpers used by the operations / resolutions pages. No
// React, no IO. Feed in already-fetched lists and get back the slices each
// page needs. Unit-testable by construction.
//
// We compute on the client because the prediction-bundler doesn't yet expose
// dedicated aggregation endpoints. Costs are bounded by the existing list
// sizes (deploy plans / sport tasks / crypto tasks), so this is OK.

import type {
  CryptoEvent,
  DeployPlan,
  DpmMarket,
  SportEvent,
  SportMarket,
} from "./types";

// ---------------------------------------------------------------------------
// Local-status bucketing — the canonical bucketing for /resolutions tabs.
//
// All sport and crypto market states come from local_status in the backoffice
// DB. Manual markets fall back to uma_resolution_status since they have no
// local_status row.
//
// Returns null for states not in the known set (safety valve for unknown values
// from future DB migrations).
// ---------------------------------------------------------------------------

export type LocalBucket =
  // Sport market states
  | "pending"
  | "created"
  | "proposing"
  | "proposed"
  | "first_time_disputed"
  | "disputed"
  | "resolving"
  | "resolved"
  | "refunded"
  | "cancelled"
  | "failed"
  // Manual market fallback buckets (from uma_resolution_status)
  | "uma_initializing"
  | "uma_proposed"
  | "uma_disputed"
  | "uma_resolved";

const SPORT_CRYPTO_BUCKETS = new Set<LocalBucket>([
  "pending", "created", "proposing", "proposed", "first_time_disputed",
  "disputed", "resolving", "resolved", "refunded", "cancelled", "failed",
]);

// Active (non-terminal) sport local_status values — used by the server-side
// pagination logic on the resolutions page to decide which tabs hit the
// dedicated sport-resolutions endpoint versus falling back to loadMarketRows.
export const SPORT_LOCAL_STATUSES = new Set<string>([
  "pending", "created", "proposing", "proposed",
  "first_time_disputed", "disputed", "resolving",
]);

export function bucketLocal(
  source: string | undefined,
  localStatus: string | null | undefined,
  umaStatus?: string | null,
): LocalBucket | null {
  if (source === "sport" || source === "crypto") {
    const s = (localStatus ?? "") as LocalBucket;
    return SPORT_CRYPTO_BUCKETS.has(s) ? s : null;
  }
  // Manual markets: use uma_resolution_status as a fallback bucketing
  const u = (umaStatus ?? "").toUpperCase();
  if (u === "INITIALIZING") return "uma_initializing";
  if (u === "PROPOSED") return "uma_proposed";
  if (u === "DISPUTED") return "uma_disputed";
  if (u === "RESOLVED" || u === "MANUALLY_RESOLVED") return "uma_resolved";
  return null;
}

export const LOCAL_BUCKET_LABEL: Record<LocalBucket, string> = {
  pending:             "Pending",
  created:             "Created",
  proposing:           "Proposing",
  proposed:            "Proposed",
  first_time_disputed: "First-time disputed",
  disputed:            "Disputed",
  resolving:           "Resolving",
  resolved:            "Resolved",
  refunded:            "Refunded",
  cancelled:           "Cancelled",
  failed:              "Failed",
  uma_initializing:    "Initialized (manual)",
  uma_proposed:        "Proposed (manual)",
  uma_disputed:        "Disputed (manual)",
  uma_resolved:        "Resolved (manual)",
};

// ---------------------------------------------------------------------------
// Volume / accepting-orders status for a DpmMarket. The UI surfaces "Accepting
// orders" + "Pending/Partial accepting orders" as two distinct flags.
// ---------------------------------------------------------------------------

export type AcceptingOrdersFlag = "open" | "pending" | "closed";

export function acceptingOrdersFlag(market: DpmMarket): AcceptingOrdersFlag {
  if (market.accepting_orders) return "open";
  // public_accepting_orders without accepting_orders means the public side has
  // toggled but the trading layer hasn't caught up yet — surface as pending.
  if (market.public_accepting_orders) return "pending";
  return "closed";
}

// ---------------------------------------------------------------------------
// Plan/Event/Sport rollups for the operations dashboard.
// ---------------------------------------------------------------------------

export type SourceCounts = {
  manual: number;
  crypto: number;
  sport: number;
};

export function countDeployPlansBySource(plans: DeployPlan[]): SourceCounts {
  const out: SourceCounts = { manual: 0, crypto: 0, sport: 0 };
  for (const plan of plans) {
    const note = (plan.note ?? "").toLowerCase();
    if (plan.actor === "sports-auto" || note.startsWith("sports/")) out.sport++;
    else if (plan.actor === "crypto-auto" || note.startsWith("crypto/")) out.crypto++;
    else out.manual++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sport-event helpers — running fixtures (in-play according to fixture status
// short codes from api-football: 1H, HT, 2H, ET, P, BT, LIVE).
// ---------------------------------------------------------------------------

const LIVE_FIXTURE_STATUSES = new Set([
  "1H",
  "HT",
  "2H",
  "ET",
  "P",
  "BT",
  "LIVE",
]);

export function isSportEventLive(event: SportEvent): boolean {
  return LIVE_FIXTURE_STATUSES.has(event.fixture_status_short);
}

// ---------------------------------------------------------------------------
// Crypto-event helpers — currently-running slot.
// ---------------------------------------------------------------------------

export function isCryptoEventLive(event: CryptoEvent, now = Date.now()): boolean {
  const start = new Date(event.slot_start).getTime();
  const end = new Date(event.slot_end).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
}

// ---------------------------------------------------------------------------
// Sport-market rollups for dispute counts (used by /resolutions and the
// operations KPI strip).
// ---------------------------------------------------------------------------

export function countSportMarketsByLifecycle(markets: SportMarket[]) {
  return markets.reduce(
    (acc, m) => {
      acc[m.local_status] = (acc[m.local_status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}
