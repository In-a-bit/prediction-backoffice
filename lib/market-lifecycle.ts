// Pure helpers for deriving lifecycle stage and per-market result. No React,
// no IO — feed in the API types you already have and get back display data.
// Spec: docs/superpowers/specs/2026-05-20-market-lifecycle-and-results-design.md

import type {
  CryptoEvent,
  CryptoMarket,
  DeployPlanMarket,
  DpmMarket,
  MarketStatusVerdict,
  SportDecision,
  SportEvent,
  SportMarket,
  CryptoEventMarketStatus,
  UmaHistoryEvent,
  UmaOraclePriceLabel,
} from "@/lib/types";
import type { PlanSource } from "@/lib/source-from-plan";

export type LifecycleStageKey =
  | "created"
  | "proposed"
  | "disputed"
  | "reset"
  | "resolved";

export type LifecycleStageStatus =
  | "pending"
  | "active"
  | "done"
  | "failed"
  | "skipped";

export type LifecycleStage = {
  key: LifecycleStageKey;
  status: LifecycleStageStatus;
  // Set to "external" only when we can positively attribute this round to a
  // non-operator party (the has_external_* flag is set). Left unset otherwise:
  // absence does NOT mean "operator" — the system itself disputes bad external
  // proposals, so a non-external round could be either. Best-effort: only the
  // most recent round carries the flag, so earlier rounds are always unset.
  origin?: "external";
  // Short annotation shown under the dot, e.g. the proposed answer.
  detail?: string;
  // The on-chain event this stage was built from, when the market's UMA
  // history was available. Set only on the history-driven path, which is what
  // makes the dot clickable — stages derived from the status strings alone
  // have no transaction to show.
  event?: UmaHistoryEvent;
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
// UMA on-chain timeline
// ---------------------------------------------------------------------------

const UMA_RESOLVED_STATUSES = new Set(["RESOLVED", "MANUALLY_RESOLVED"]);

// Builds the full UMA lifecycle, preferring the on-chain event history from
// dpm-api's /uma/history when it is available: those events carry the
// transaction, block and parameters behind every step, which is what lets the
// UI make each dot clickable.
//
// Markets indexed before that endpoint existed (or whose event rows predate
// the market_id backfill) return an empty history — they fall back to the
// status-string derivation below, which still renders every round but without
// per-step provenance.
export function deriveUmaTimeline(
  market: DpmMarket,
  events?: UmaHistoryEvent[],
): Lifecycle {
  if (events && events.length > 0) return umaTimelineFromEvents(market, events);
  return umaTimelineFromStatuses(market);
}

// The events arrive in chain order and already have dispute-triggered resets
// folded into the dispute that caused them, so each one maps to exactly one
// dot. A trailing Resolved dot is appended while the market has yet to
// resolve, so the timeline keeps showing where it is heading.
function umaTimelineFromEvents(
  market: DpmMarket,
  events: UmaHistoryEvent[],
): Lifecycle {
  const current = (market.uma_resolution_status ?? "").toUpperCase();
  const lastProposedIdx = lastIndexOfEvent(events, "proposed");
  const lastDisputedIdx = lastIndexOfEvent(events, "disputed");

  const stages = events.map((event, i) =>
    stageForEvent(event, {
      isLastOfKind:
        (event.type === "proposed" && i === lastProposedIdx) ||
        (event.type === "disputed" && i === lastDisputedIdx),
      isLastEvent: i === events.length - 1,
      current,
      market,
    }),
  );

  // question_initialized_events predates the market_id backfill on a
  // different schedule than the other four event tables, so a market can
  // have backfilled propose/dispute rows but no matching created row. Don't
  // let the timeline silently start at "Proposed" — add a non-clickable
  // created dot (we know the market was created; we just can't point at the
  // transaction) rather than dropping the step.
  if (events[0]?.type !== "created") {
    stages.unshift({ key: "created", status: "done" });
  }

  if (!events.some((e) => e.type === "resolved")) {
    stages.push(resolvedStage(current));
  }
  return { stages };
}

type StageContext = {
  isLastOfKind: boolean;
  isLastEvent: boolean;
  current: string;
  market: DpmMarket;
};

function stageForEvent(event: UmaHistoryEvent, ctx: StageContext): LifecycleStage {
  switch (event.type) {
    case "created":
      return { key: "created", status: "done", event };
    case "proposed":
      return proposedEventStage(event, ctx);
    case "disputed":
      return disputedEventStage(event, ctx);
    case "reset":
      return resetEventStage(event, ctx);
    default:
      return { key: "resolved", status: "done", event };
  }
}

function proposedEventStage(event: UmaHistoryEvent, ctx: StageContext): LifecycleStage {
  const stillLive = ctx.isLastOfKind && ctx.current === "PROPOSED";
  const stage: LifecycleStage = {
    key: "proposed",
    status: stillLive ? "active" : "done",
    event,
  };
  if (ctx.isLastOfKind && ctx.market.has_external_proposal) stage.origin = "external";
  const answer = event.proposed_price_label
    ? umaPriceLabelName(event.proposed_price_label)
    : undefined;
  if (answer) stage.detail = answer;
  return stage;
}

function disputedEventStage(event: UmaHistoryEvent, ctx: StageContext): LifecycleStage {
  // A dispute is a completed on-chain event, not a process failure — mark it
  // "done". The stepper renders the disputed key in a danger tone on its own,
  // so it still reads as a red flag without labelling the round "failed".
  const stage: LifecycleStage = { key: "disputed", status: "done", event };
  if (ctx.isLastOfKind && ctx.market.has_external_dispute) stage.origin = "external";
  return stage;
}

// A standalone reset is only "active" while it is still the market's latest
// word — once a fresh proposal follows it, it is just another completed round.
function resetEventStage(event: UmaHistoryEvent, ctx: StageContext): LifecycleStage {
  const stillLive = ctx.isLastEvent && ctx.current === "INITIALIZING";
  return { key: "reset", status: stillLive ? "active" : "done", event };
}

function lastIndexOfEvent(
  events: UmaHistoryEvent[],
  type: UmaHistoryEvent["type"],
): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return i;
  }
  return -1;
}

// Display names for dpm-api's classified on-chain price. The classification
// is market-agnostic (see labelForOraclePrice in apps/dpm-api), so these are
// the generic answer names rather than the market's own outcome titles.
const UMA_PRICE_LABEL_NAMES: Record<UmaOraclePriceLabel, string> = {
  first_outcome_yes: "YES",
  second_outcome_yes: "NO",
  fifty_fifty: "50 / 50",
  too_early: "Too early",
  none: "—",
  unknown: "Unknown",
};

export function umaPriceLabelName(label: UmaOraclePriceLabel): string {
  return UMA_PRICE_LABEL_NAMES[label] ?? UMA_PRICE_LABEL_NAMES.unknown;
}

export type UmaPriceBadgeTone = "neutral" | "success" | "warning";

// Maps a classified on-chain price label to the badge tone it should render
// in — shared by the question_id/getRequest drawer and the lifecycle-history
// drawer so the same price always reads the same tone wherever it is shown.
export function umaPriceLabelTone(label: UmaOraclePriceLabel): UmaPriceBadgeTone {
  switch (label) {
    case "first_outcome_yes":
    case "second_outcome_yes":
      return "success";
    case "fifty_fifty":
    case "too_early":
      return "warning";
    default:
      return "neutral";
  }
}

// Fallback path: builds the lifecycle from the append-only
// uma_resolution_statuses array — dpm-api pushes PROPOSED on every proposal
// and DISPUTED on every dispute (libs/txprocessor/handler_oracle.go), so a
// re-proposal after a dispute shows every round rather than collapsing to a
// single "proposed" step.
//
// Known limits: the array carries no timestamps and no per-round attribution,
// so only the most recent propose/dispute can be tagged external (from the
// has_external_* flags, which reflect the current lingering activity).
function umaTimelineFromStatuses(market: DpmMarket): Lifecycle {
  const history = market.uma_resolution_statuses ?? [];
  const current = (market.uma_resolution_status ?? "").toUpperCase();

  const lastProposedIdx = lastIndexOfStatus(history, "PROPOSED");
  const lastDisputedIdx = lastIndexOfStatus(history, "DISPUTED");
  const disputeCount = history.filter((s) => s.toUpperCase() === "DISPUTED").length;

  const stages: LifecycleStage[] = [{ key: "created", status: "done" }];
  history.forEach((raw, i) => {
    const entry = raw.toUpperCase();
    if (entry === "PROPOSED") {
      stages.push(proposedStage(i === lastProposedIdx, current, market));
    } else if (entry === "DISPUTED") {
      stages.push(disputedStage(i === lastDisputedIdx, market));
    }
  });
  // The very first dispute always resets the question unconditionally (the
  // adapter gives the proposer one automatic do-over before ever involving
  // the DVM), so landing on INITIALIZING after it is guaranteed and carries
  // no information — not worth a stage of its own. From the second dispute
  // on, the question only reaches INITIALIZING because the DVM voted "price
  // too early" instead of giving a real answer, which is a distinct, secondary
  // outcome the operator needs to notice (a fresh proposal is required) —
  // surface it explicitly rather than letting it look identical to "still
  // awaiting the DVM".
  if (current === "INITIALIZING" && disputeCount >= 2) {
    stages.push({ key: "reset", status: "active" });
  }
  stages.push(resolvedStage(current));

  return { stages };
}

function proposedStage(isLast: boolean, current: string, market: DpmMarket): LifecycleStage {
  const stillLive = isLast && current === "PROPOSED";
  const stage: LifecycleStage = {
    key: "proposed",
    status: stillLive ? "active" : "done",
  };
  if (isLast && market.has_external_proposal) stage.origin = "external";
  if (isLast) {
    const answer = proposedPriceLabel(market.last_proposal_price);
    if (answer) stage.detail = answer;
  }
  return stage;
}

function disputedStage(isLast: boolean, market: DpmMarket): LifecycleStage {
  // A dispute is a completed on-chain event, not a process failure — mark it
  // "done". The stepper renders the disputed key in a danger tone on its own,
  // so it still reads as a red flag without labelling the round "failed".
  const stage: LifecycleStage = { key: "disputed", status: "done" };
  if (isLast && market.has_external_dispute) stage.origin = "external";
  return stage;
}

function resolvedStage(current: string): LifecycleStage {
  if (UMA_RESOLVED_STATUSES.has(current)) return { key: "resolved", status: "done" };
  if (current === "RESOLVING") return { key: "resolved", status: "active" };
  return { key: "resolved", status: "pending" };
}

function lastIndexOfStatus(history: string[], target: string): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].toUpperCase() === target) return i;
  }
  return -1;
}

function proposedPriceLabel(price?: string | null): string | undefined {
  if (price === PRICE_YES) return "YES";
  if (price === PRICE_NO) return "NO";
  if (price === PRICE_5050) return "50/50";
  return undefined;
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
