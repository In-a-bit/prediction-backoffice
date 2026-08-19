import "server-only";

import { BackofficeApiError, manual, resolutions, sports } from "./api";
import type { Lifecycle, LifecycleStageStatus } from "./market-lifecycle";
import type { MarketRow } from "./market-rows";
import type { PlanSource } from "./source-from-plan";
import type { DpmMarket } from "./types";

// Markets carrying non-operator UMA activity. The monitor sets
// markets.has_external_proposal / has_external_dispute on the dpm side, so
// dpm-api is the only authoritative source — the /resolutions row loader
// hydrates at most a window of rows and would silently miss flagged markets
// outside it. This loader asks the Go backoffice (which proxies dpm-api) for
// that list, then resolves each market back to its backoffice row so the
// operator lands on a page with the accept/dispute actions wired up.

export type ExternalMarketRow = MarketRow & {
  has_external_proposal: boolean;
  has_external_dispute: boolean;
  proposed_price: string | null;
  proposer: string | null;
  /** Unix seconds; null when no proposal has been observed on-chain. */
  proposal_expiration: number | null;
};

/**
 * Loads every market with an external proposal or dispute. Failures are
 * returned rather than thrown so the page can still render its other tabs.
 */
export async function loadExternalMarketRows(): Promise<{
  rows: ExternalMarketRow[];
  error: string | null;
}> {
  try {
    const markets = await fetchFlaggedMarkets();
    const rows = await Promise.all(markets.map(toExternalRow));
    return {
      rows: rows.sort((a, b) => b.sortKey - a.sortKey),
      error: null,
    };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// The Go backoffice merges/dedupes the two underlying dpm-api flag queries
// (a market can carry either or both) server-side; this just fetches the result.
async function fetchFlaggedMarkets(): Promise<DpmMarket[]> {
  return resolutions.listExternal();
}

async function toExternalRow(market: DpmMarket): Promise<ExternalMarketRow> {
  const backoffice = await findBackofficeMarket(market.external_id);
  const updatedAt = market.updated_at ?? market.created_at;
  return {
    market_external_id: market.external_id,
    question: market.question,
    source: backoffice.source,
    event_external_id: null,
    event_title: null,
    series_slug: null,
    created_at: updatedAt,
    sport_market_id: backoffice.sportMarketId,
    manual_market_id: backoffice.manualMarketId,
    active: market.active,
    closed: market.closed,
    accepting: null,
    accepting_orders_at: market.accepting_orders_timestamp ?? null,
    local_status: backoffice.localStatus,
    uma_resolution_status: market.uma_resolution_status ?? null,
    uma_resolution_statuses: market.uma_resolution_statuses ?? null,
    closed_time: null,
    has_external_proposal: market.has_external_proposal === true,
    has_external_dispute: market.has_external_dispute === true,
    proposed_price: market.last_proposal_price ?? null,
    proposer: market.last_proposal_proposer ?? null,
    proposal_expiration: market.last_proposal_expiration ?? null,
    lifecycle: lifecycleFromUmaStatus(market.uma_resolution_status),
    result: { kind: "pending", label: "Pending" },
    sortKey: new Date(updatedAt).getTime(),
  };
}

// These markets are driven entirely on-chain — an external party proposed, so
// there is no backoffice propose step to read a local_status from. The UMA
// status is the only lifecycle signal available.
const UMA_PAST_PROPOSE = new Set([
  "PROPOSED",
  "DISPUTING",
  "DISPUTED",
  "RESOLVING",
  "RESOLVED",
  "MANUALLY_RESOLVED",
]);
const UMA_RESOLVED = new Set(["RESOLVED", "MANUALLY_RESOLVED"]);

function lifecycleFromUmaStatus(status?: string | null): Lifecycle {
  const uma = (status ?? "").toUpperCase();
  const stageStatus = (done: boolean): LifecycleStageStatus =>
    done ? "done" : "pending";
  return {
    stages: [
      { key: "created", status: "done" },
      { key: "proposed", status: stageStatus(UMA_PAST_PROPOSE.has(uma)) },
      { key: "resolved", status: stageStatus(UMA_RESOLVED.has(uma)) },
    ],
  };
}

type BackofficeMarketRef = {
  source: PlanSource;
  localStatus: string | null;
  manualMarketId?: number;
  sportMarketId?: number;
};

// Externally proposed markets are rare, so a lookup per market is cheaper than
// listing every sport and manual row. Manual is checked first: it is the only
// source where the operator is asked to accept or dispute by hand.
async function findBackofficeMarket(
  externalId: string,
): Promise<BackofficeMarketRef> {
  const [manualRef, sportRef] = await Promise.all([
    findOrNull(manual.findManualMarketByExternalId(externalId)),
    findOrNull(sports.findMarketByExternalId(externalId)),
  ]);
  if (manualRef) {
    return {
      source: "manual",
      localStatus: manualRef.local_status,
      manualMarketId: manualRef.id,
    };
  }
  if (sportRef) {
    return {
      source: "sport",
      localStatus: sportRef.local_status,
      sportMarketId: sportRef.id,
    };
  }
  // Both lookups came back a genuine 404 (see findOrNull — anything else
  // propagates instead of landing here). has_external_proposal /
  // has_external_dispute are UMA-only flags that crypto markets never set
  // (they resolve via CTF_ORACLE and never run the UMA propose/dispute flow
  // that sets them), so a market carrying one is always sport or manual —
  // "crypto" here is not a real answer, just the least-wrong label the
  // PlanSource type has for "neither backoffice row exists", e.g. because the
  // backoffice-local mirror row hasn't caught up with dpm-api yet.
  return { source: "crypto", localStatus: null };
}

// findOrNull turns a genuine "no such row" (404) into null so the caller can
// fall through to the next source, while letting any other failure (5xx,
// timeout, network) propagate to loadExternalMarketRows's try/catch. Without
// this, a transient failure on the manual lookup for a market that *is*
// manual would silently mislabel it "crypto" — with no manual_market_id, the
// accept/dispute controls on that market's detail page never render, and
// nothing tells the operator why.
async function findOrNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof BackofficeApiError && err.status === 404) return null;
    throw err;
  }
}