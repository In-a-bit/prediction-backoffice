// Pure helpers for deriving lifecycle stage and per-market result. No React,
// no IO — feed in the API types you already have and get back display data.
// Spec: docs/superpowers/specs/2026-05-20-market-lifecycle-and-results-design.md

import type {
  CryptoEvent,
  CryptoMarket,
  DeployPlanMarket,
  MarketStatusVerdict,
  SportDecision,
  SportEvent,
  SportMarket,
  SportMarketStatus,
  CryptoEventMarketStatus,
} from "@/lib/types";
import type { PlanSource } from "@/lib/source-from-plan";

export type LifecycleStageKey = "created" | "proposed" | "resolved";

export type LifecycleStageStatus =
  | "pending"
  | "active"
  | "done"
  | "failed"
  | "skipped";

export type LifecycleStage = {
  key: LifecycleStageKey;
  status: LifecycleStageStatus;
};

export type Lifecycle = {
  stages: LifecycleStage[];
};

export type ResultKind = "won" | "lost" | "refund" | "pending" | "na";

export type Result = {
  kind: ResultKind;
  label: string;
  reason?: string;
};

// dpm-api encodes outcome prices as 18-decimal fixed-point strings:
// 1e18 = YES (this outcome won), 0 = NO (lost), 0.5e18 = 50/50 (refund).
const PRICE_YES = "1000000000000000000";
const PRICE_NO = "0";
const PRICE_5050 = "500000000000000000";

// ---------------------------------------------------------------------------
// Sport
// ---------------------------------------------------------------------------

// local_status drives every lifecycle stage for sport markets — it mirrors
// the UMA on-chain state machine once the market is created, so there is no
// need to also read uma_resolution_status here.
const SPORT_STAGE_TABLE: Record<
  string,
  [LifecycleStageStatus, LifecycleStageStatus, LifecycleStageStatus]
> = {
  //               created   proposed   resolved
  pending:            ["active",   "pending", "pending"],
  created:            ["done",     "pending", "pending"],
  proposing:          ["done",     "active",  "pending"],
  proposed:           ["done",     "done",    "pending"],
  reset:              ["done",     "failed",  "pending"],
  disputed:           ["done",     "failed",  "pending"],
  resolving:          ["done",     "done",    "active"],
  resolved:           ["done",     "done",    "done"],
  refunded:           ["done",     "done",    "done"],
  cancelled:          ["done",     "skipped", "skipped"],
  failed:             ["failed",   "pending", "pending"],
};

export function deriveSportLifecycle(market: SportMarket): Lifecycle {
  const row =
    SPORT_STAGE_TABLE[market.local_status] ?? SPORT_STAGE_TABLE.pending;
  return {
    stages: [
      { key: "created",  status: row[0] },
      { key: "proposed", status: row[1] },
      { key: "resolved", status: row[2] },
    ],
  };
}

export function deriveSportResult(
  market: SportMarket,
  decision?: SportDecision,
): Result {
  if (market.local_status === "cancelled") {
    return { kind: "refund", label: "Cancelled", reason: "Market was cancelled" };
  }
  if (market.local_status === "refunded") {
    return { kind: "refund", label: "Refunded", reason: "50/50 refund" };
  }
  if (market.local_status !== "resolved") {
    return { kind: "pending", label: "Pending" };
  }
  if (!decision) {
    return { kind: "pending", label: "Pending", reason: "Awaiting decision record" };
  }
  if (decision.decision_kind === "refund_5050") {
    return { kind: "refund", label: "Refunded", reason: "50/50 refund decision" };
  }
  const price = decision.proposed_prices[market.outcome_key];
  if (price === undefined) {
    return {
      kind: "pending",
      label: "Pending",
      reason: `Outcome ${market.outcome_key} not present in decision`,
    };
  }
  if (price === PRICE_YES) {
    return {
      kind: "won",
      label: "Won",
      reason: `Decision priced ${market.outcome_key} = YES`,
    };
  }
  if (price === PRICE_NO) {
    return {
      kind: "lost",
      label: "Lost",
      reason: `Decision priced ${market.outcome_key} = NO`,
    };
  }
  if (price === PRICE_5050) {
    return {
      kind: "refund",
      label: "Refunded",
      reason: `Decision priced ${market.outcome_key} = 50/50`,
    };
  }
  return {
    kind: "pending",
    label: "Pending",
    reason: `Unrecognized price ${price}`,
  };
}

// Resolves the decision that applies to a given sport market. SportEvent
// carries an array of decisions keyed by market_type — pick the one matching
// the market's sport_market_type_id.
export function findSportDecisionFor(
  event: SportEvent | undefined,
  market: SportMarket,
): SportDecision | undefined {
  if (!event?.decisions) return undefined;
  return event.decisions.find(
    (d) => d.sport_market_type_id === market.sport_market_type_id,
  );
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

// Crypto markets have no UMA propose step — only created → resolved.
const CRYPTO_STAGE_TABLE: Record<
  CryptoEventMarketStatus,
  [LifecycleStageStatus, LifecycleStageStatus]
> = {
  pending:    ["active",  "pending"],
  created:    ["done",    "pending"],
  verified:   ["done",    "pending"],
  resolving:  ["done",    "active"],
  resolved:   ["done",    "done"],
  cancelled:  ["done",    "skipped"],
  failed:     ["failed",  "pending"],
};

export function deriveCryptoLifecycle(
  market: CryptoMarket,
  verdict?: MarketStatusVerdict | null,
): Lifecycle {
  const row = CRYPTO_STAGE_TABLE[market.local_status] ?? CRYPTO_STAGE_TABLE.pending;
  let resolvedStatus = row[1];

  // Use the dpm-api uma_resolution_status as the authoritative source for the
  // resolved step. This covers markets whose local_status is stuck at
  // "resolving" (resolved before the backoffice activity was fixed) and manual
  // resolutions where the on-chain workflow has since completed.
  if (resolvedStatus !== "done") {
    const uma = verdict?.market?.uma_resolution_status?.toLowerCase();
    if (uma === "resolved" || uma === "manually_resolved") {
      resolvedStatus = "done";
    }
  }

  return {
    stages: [
      { key: "created",  status: row[0] },
      { key: "resolved", status: resolvedStatus },
    ],
  };
}

export function deriveCryptoResult(
  market: CryptoMarket,
  event?: CryptoEvent,
): Result {
  if (market.local_status === "cancelled") {
    return { kind: "refund", label: "Cancelled", reason: "Market was cancelled" };
  }
  // Show the decision outcome whenever it is available — a decision record is
  // authoritative regardless of whether local_status has caught up to "resolved".
  const outcome = event?.decision?.outcome;
  if (outcome) {
    return { kind: "won", label: outcome.toUpperCase() };
  }
  return { kind: "pending", label: "Pending" };
}

// ---------------------------------------------------------------------------
// Manual
// ---------------------------------------------------------------------------

export function deriveManualLifecycle(
  planMarket?: DeployPlanMarket,
  verdict?: MarketStatusVerdict,
): Lifecycle {
  // Created stage — driven by plan status + verdict.
  let created: LifecycleStageStatus = "pending";
  if (planMarket?.status === "deployed" || verdict?.status === "deployed") {
    created = "done";
  } else if (
    planMarket?.status === "submitting" ||
    planMarket?.status === "running" ||
    planMarket?.status === "waiting_for_balance" ||
    verdict?.status === "running" ||
    verdict?.status === "deploying" ||
    verdict?.status === "waiting_for_balance"
  ) {
    created = "active";
  } else if (planMarket?.status === "failed" || verdict?.status === "failed") {
    created = "failed";
  } else if (planMarket?.status === "skipped") {
    created = "skipped";
  }

  // Proposed / resolved — driven by uma_resolution_status when available.
  const uma = verdict?.market?.uma_resolution_status?.toLowerCase();
  let proposed: LifecycleStageStatus = "pending";
  let resolved: LifecycleStageStatus = "pending";
  if (uma === "proposing") {
    proposed = "active";
  } else if (uma === "proposed") {
    proposed = "done";
  } else if (uma === "disputed") {
    proposed = "failed";
  } else if (uma === "resolving") {
    proposed = "done";
    resolved = "active";
  } else if (uma === "resolved" || uma === "manually_resolved") {
    proposed = "done";
    resolved = "done";
  }
  return {
    stages: [
      { key: "created",  status: created },
      { key: "proposed", status: proposed },
      { key: "resolved", status: resolved },
    ],
  };
}

export function deriveManualResult(): Result {
  // Manual markets have no automated decision pipeline. We could read
  // uma_resolution_status but the operator already sees that in the lifecycle
  // stepper; emitting "na" keeps the result chip off the UI for these rows.
  return { kind: "na", label: "" };
}

// ---------------------------------------------------------------------------
// Unified dispatcher
// ---------------------------------------------------------------------------

export type DeriveInput =
  | { source: "sport"; sportMarket: SportMarket; sportEvent?: SportEvent; verdict?: MarketStatusVerdict | null }
  | { source: "crypto"; cryptoMarket: CryptoMarket; cryptoEvent?: CryptoEvent; verdict?: MarketStatusVerdict | null }
  | {
      source: "manual";
      planMarket?: DeployPlanMarket;
      verdict?: MarketStatusVerdict;
    };

export function derive(
  input: DeriveInput,
): { lifecycle: Lifecycle; result: Result } {
  if (input.source === "sport") {
    const decision = findSportDecisionFor(input.sportEvent, input.sportMarket);
    return {
      lifecycle: deriveSportLifecycle(input.sportMarket),
      result: deriveSportResult(input.sportMarket, decision),
    };
  }
  if (input.source === "crypto") {
    return {
      lifecycle: deriveCryptoLifecycle(input.cryptoMarket, input.verdict),
      result: deriveCryptoResult(input.cryptoMarket, input.cryptoEvent),
    };
  }
  return {
    lifecycle: deriveManualLifecycle(input.planMarket, input.verdict),
    result: deriveManualResult(),
  };
}

// Sanity helper: ensure the source string is one of the three known values.
export function isPlanSource(s: unknown): s is PlanSource {
  return s === "sport" || s === "crypto" || s === "manual";
}
