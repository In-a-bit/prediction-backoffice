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
  OperatorLogEntry,
  SportEvent,
  SportMarket,
} from "./types";

// ---------------------------------------------------------------------------
// UMA resolution status — the canonical bucketing for /resolutions tabs.
// dpm-api stores the raw string from UMA's contracts; we normalise here so
// the rest of the UI can switch on a closed set of values.
// ---------------------------------------------------------------------------

export type UmaBucket =
  | "unstarted"
  | "ready_to_request"
  | "ready_to_propose"
  | "proposed"
  | "disputed"
  | "settled"
  | "challenge_period"
  | "unknown";

export function bucketUma(raw: string | null | undefined): UmaBucket {
  const s = (raw ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return "unstarted";
  // UMA "INITIALIZING" means the question exists but resolution hasn't begun —
  // it belongs in "Not started", not the catch-all "Unknown" bucket.
  if (s === "initializing" || s === "initialized") return "unstarted";
  if (s.startsWith("ready_to_request") || s === "ready_to_request_resolution")
    return "ready_to_request";
  if (s.startsWith("ready_to_propose") || s === "ready_to_propose_resolution")
    return "ready_to_propose";
  if (s.includes("propos")) return "proposed";
  if (s.includes("disput")) return "disputed";
  if (s === "settled" || s === "resolved") return "settled";
  if (s.includes("challenge")) return "challenge_period";
  return "unknown";
}

export const UMA_BUCKET_LABEL: Record<UmaBucket, string> = {
  unstarted: "Not started",
  ready_to_request: "Ready to request",
  ready_to_propose: "Ready to propose",
  proposed: "Proposed",
  disputed: "Disputed",
  settled: "Settled",
  challenge_period: "In challenge period",
  unknown: "Unknown",
};

// ---------------------------------------------------------------------------
// First-time disputed — an alert-worthy signal: a market that just entered
// the disputed bucket and has never been disputed before. We approximate
// "first time" by checking the operator log for any prior dispute action
// against the same resource_external_id.
// ---------------------------------------------------------------------------

export function isFirstTimeDisputed(
  marketExternalId: string,
  log: OperatorLogEntry[],
): boolean {
  // Approximate "first dispute": no prior log row whose payload mentions
  // dispute exists for this market. The create_market row is excluded
  // because the freshly-disputed state is itself a creation event in some
  // flows, and including it would always answer false.
  const priorDisputeMentions = log.filter((entry) => {
    if (entry.resource_external_id !== marketExternalId) return false;
    if (entry.action === "create_market") return false;
    const payloadStr = JSON.stringify(entry.request_payload ?? {}).toLowerCase();
    return payloadStr.includes("disput");
  });
  return priorDisputeMentions.length <= 1;
}

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
