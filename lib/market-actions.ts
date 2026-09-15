import type {
  DeployPlanMarket,
  DpmMarket,
  ExternalProposalDecision,
  ManualMarketLocalStatus,
  MarketStatus,
  SportEvent,
  SportMarket,
  SportMarketStatus,
} from "./types";
import type { PlanSource } from "./source-from-plan";

// Catalog of every action an operator can fire on a market.
export type MarketActionKey =
  // Plan-phase (DeployPlanMarket lifecycle, before the market exists on-chain
  // or while it's stuck mid-deploy).
  | "retry"
  | "recreate"
  // dpm-api UMA resolution actions (apply once the market is on-chain).
  // Gating mirrors apps/dpm-api/handlers/uma_action.go:
  //   Propose  requires uma_resolution_status === INITIALIZING
  //   Resolve  requires uma_resolution_status ∈ {PROPOSED, DISPUTED}
  //   Reset / ResolveManually are escape hatches (no status precondition).
  | "uma-propose"
  | "uma-resolve"
  | "uma-reset"
  | "uma-resolve-manually"
  // CTF_ORACLE markets are admin-settled, no UMA. The "propose price" UI
  // submits a payouts vector to /markets/ctf-oracle/report-payouts.
  | "ctf-oracle-report-payouts"
  // Generic lifecycle (apply to both UMA and CTF_ORACLE markets once they
  // are on-chain). Activate is the manual analogue of automatically_active=true.
  | "market-unpause"
  | "market-activate"
  // Manual-market-specific actions — wired through the backoffice's
  // /manual/backoffice-markets endpoint (requires a manual_market DB row).
  | "manual-watch-dispute"
  // An outside party proposed a price on one of our markets. The operator's
  // call is recorded in operator_logs and read by the running
  // ManualMarketResolutionWorkflow's dispute-watch; staying silent past
  // dispute_by makes the workflow dispute on its own.
  | "uma-accept-external-proposal"
  | "uma-dispute-external-proposal"
  // Operator dispute of whatever proposal is live on a sport or manual market —
  // ours or an external one. The backoffice pins it to the proposal it reads at
  // request time, so a replaced proposal is refused rather than disputed.
  | "uma-dispute"
  // Recover stuck CTF funds after a first-dispute DVM reset. Visible when
  // settle_status === "settle_required" and a backoffice market ID is present
  // (sport or manual only — crypto markets have no backoffice row).
  | "uma-recover-funds";

export type MarketActionCtx = {
  source: PlanSource;
  dpmMarket?: DpmMarket;
  verdictStatus?: MarketStatus;
  planMarket?: DeployPlanMarket;
  planExternalId?: string;
  sportMarketId?: number;
  sportLocalStatus?: SportMarketStatus;
  // Whether the sports dispatcher is still going to propose this market on its
  // own: a SportDecision priced for this outcome exists and its one-shot
  // propose pass hasn't run yet (propose_dispatched_at unset — see
  // apps/backoffice/internal/scheduler/sports/dispatcher.go's RunOnce doc).
  // While true, a manual "Propose price" would only race the 10s dispatcher
  // tick, so it isn't offered.
  sportAutoProposePending?: boolean;
  // Whether that one-shot automatic propose pass has already run
  // (propose_dispatched_at set). It is never cleared, so a market reset after
  // it will not be proposed automatically again.
  sportProposeExhausted?: boolean;
  // The sport (sports.key) and its vendor's latest game status short code
  // (sport_events.fixture_status_short). The codes collide across sports, so
  // the key picks the vocabulary.
  sportKey?: string;
  sportFixtureStatus?: string;
  manualMarketId?: number;
  manualLocalStatus?: ManualMarketLocalStatus;
  // The operator's already-recorded call on the current external proposal.
  // Present means the decision is made and the buttons must not offer it again.
  externalProposalDecision?: ExternalProposalDecision;
  // Whether a SportDecision accepts or disputes the current external proposal
  // by itself (sport markets only), leaving no call for the operator to make.
  externalProposalAutomated?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers — encode the dpm-api business rules in one place.
// ---------------------------------------------------------------------------

// IsDeploymentSuccessful in libs/dpmclient: REGISTERED is the new terminal
// success status, DEPLOYED is the legacy alias.
const DEPLOY_SUCCESS = new Set(["REGISTERED", "DEPLOYED"]);

// uma_resolution_status enum values from libs/db/ent/market/market.go.
type UmaStatus =
  | "INITIALIZING"
  | "PROPOSING"
  | "PROPOSED"
  | "DISPUTED"
  | "RESOLVING"
  | "RESOLVED"
  | "MANUALLY_RESOLVED";

function umaStatus(d?: DpmMarket): UmaStatus | undefined {
  const s = (d?.uma_resolution_status ?? "").toUpperCase();
  if (!s) return undefined;
  if (
    s === "INITIALIZING" ||
    s === "PROPOSING" ||
    s === "PROPOSED" ||
    s === "DISPUTED" ||
    s === "RESOLVING" ||
    s === "RESOLVED" ||
    s === "MANUALLY_RESOLVED"
  ) {
    return s;
  }
  return undefined;
}

// dpm-api's MarketResponse doesn't expose `resolution_type`, so we infer.
// The Go default (libs/db/ent/market/market.go) is ResolutionTypeUma — so when
// in doubt we treat the market as UMA. We only classify as CTF_ORACLE when
// there's positive evidence (explicit field, or a non-empty market_type) AND
// the market has no UMA wiring whatsoever. This keeps Reset/Resolve-manually
// out of CTF_ORACLE UIs while not hiding UMA actions on freshly-deployed
// markets where uma_resolution_status / uma_bond / uma_reward are still null.
function isCtfOracle(d?: DpmMarket): boolean {
  if (!d) return false;
  const explicit = (d.resolution_type ?? d.market_type ?? "").toUpperCase();
  if (explicit === "CTF_ORACLE") return true;
  // Anything else — including missing/unknown type — defaults to UMA.
  return false;
}

function isOnChain(ctx: MarketActionCtx): boolean {
  if (ctx.verdictStatus === "deployed") return true;
  if (ctx.planMarket?.status === "deployed") return true;
  const s = (ctx.dpmMarket?.deployment_status ?? "").toUpperCase();
  if (DEPLOY_SUCCESS.has(s)) return true;
  // Fallback: any dpm-api record carrying condition_id / question_id is
  // already on-chain — even if our status enum hasn't synced.
  if (ctx.dpmMarket?.condition_id || ctx.dpmMarket?.question_id) return true;
  return false;
}

function umaIsTerminal(u: UmaStatus | undefined): boolean {
  return u === "RESOLVED" || u === "MANUALLY_RESOLVED";
}

// dpm-api's UmaPropose validator rejects a proposal unless the question is back
// at INITIALIZING. A market already PROPOSED/DISPUTED on chain must not offer
// "Propose price" even when a stale local_status still reads created/reset, so
// every propose gate is ANDed with this. Absent dpm data (undefined) is treated
// as "cannot propose" — we never guess a proposable state we can't confirm.
function canProposeOnChain(ctx: MarketActionCtx): boolean {
  return umaStatus(ctx.dpmMarket) === "INITIALIZING";
}

// Game statuses the sports Decide strategies deliberately leave open (see the
// decision matrices in prediction-bundler apps/backoffice/internal/
// sportsresolution/*). Only these need an operator's price; any other status is
// either still in play or settled automatically. Keys match sports.key.
const OPERATOR_PROPOSABLE_GAME_STATUSES: Record<string, ReadonlySet<string>> = {
  baseball: new Set(["POST", "CANC", "INTR", "ABD"]),
  basketball: new Set(["POST", "CANC", "SUSP", "AWD", "ABD"]),
  hockey: new Set(["AW", "POST", "CANC", "INTR", "ABD"]),
  nfl: new Set(["CANC", "PST"]),
  soccer: new Set(["PST", "CANC", "ABD", "AWD", "WO"]),
};

// An unknown sport or a missing status is "no" — like canProposeOnChain, we
// never offer a proposal on a game state we can't confirm.
function gameAwaitsOperatorProposal(ctx: MarketActionCtx): boolean {
  const statuses = ctx.sportKey ? OPERATOR_PROPOSABLE_GAME_STATUSES[ctx.sportKey] : undefined;
  const status = (ctx.sportFixtureStatus ?? "").toUpperCase();
  return !!statuses?.has(status);
}

// A market reset after the dispatcher's one automatic propose pass is never
// proposed automatically again, so it is the operator's to handle whatever the
// game status is.
function automaticProposeWillNotRetry(ctx: MarketActionCtx): boolean {
  return ctx.sportLocalStatus === "reset" && !!ctx.sportProposeExhausted;
}

// CTF_ORACLE markets don't carry a per-status enum; once they're resolved on
// chain the dpm-api row is marked closed=true. Treat closed/archived as
// terminal so we stop offering "Report payouts".
function ctfIsTerminal(d?: DpmMarket): boolean {
  return !!(d?.closed || d?.archived);
}

// A decision is open only while the proposal is still live on-chain (PROPOSED
// with the external flag set), the operator hasn't recorded one, and no
// SportDecision settles it by itself. Mirrors the guards in
// apps/backoffice/handlers/manual_external_proposal.go and
// sports_external_proposal.go, so we never offer a call the backoffice would
// reject.
function awaitsExternalProposalDecision(ctx: MarketActionCtx): boolean {
  if (ctx.externalProposalDecision) return false;
  if (ctx.externalProposalAutomated) return false;
  if (!ctx.dpmMarket?.has_external_proposal) return false;
  return umaStatus(ctx.dpmMarket) === "PROPOSED";
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export function getAvailableActions(ctx: MarketActionCtx): MarketActionKey[] {
  const actions: MarketActionKey[] = [];

  // 1) Plan-phase actions while the deploy is still in flight.
  if (ctx.planMarket && ctx.planExternalId) {
    const s = ctx.planMarket.status;
    if (s === "failed") actions.push("retry", "recreate");
  }

  // 2) Manual-market dispute handling — needs a backoffice manual_market row.
  //     Watch-dispute is available in the disputed phase.
  if (ctx.source === "manual" && ctx.manualMarketId !== undefined) {
    if (ctx.manualLocalStatus === "disputed") {
      actions.push("manual-watch-dispute");
    }
    if (awaitsExternalProposalDecision(ctx)) {
      actions.push("uma-accept-external-proposal");
    }
    // Dispute whenever the market is proposed. An external proposal still
    // awaiting the operator's call is disputed through the recorded decision
    // the dispute-watch reads; any other proposal — ours included — directly.
    if (ctx.manualLocalStatus === "proposed") {
      actions.push(
        awaitsExternalProposalDecision(ctx) ? "uma-dispute-external-proposal" : "uma-dispute",
      );
    }
  }

  // 3) On-chain lifecycle actions — gated on resolution_type and the dpm-api
  //    validators so we never offer something the backend would reject.
  if (!isOnChain(ctx)) return actions;

  // Resolution-type-specific actions.
  // Crypto markets are resolved automatically via the price-ticker decision
  // flow — operators never manually report payouts.
  if (ctx.source === "crypto") {
    // No operator actions for crypto resolution.
  } else if (isCtfOracle(ctx.dpmMarket)) {
    if (!ctfIsTerminal(ctx.dpmMarket)) {
      actions.push("ctf-oracle-report-payouts");
    }
  } else if (ctx.source === "sport") {
    // A sport market whose backoffice row didn't load gets no UMA action: all
    // of them are gated on local_status, and the dpm-only fallback below would
    // propose straight to dpm-api, bypassing the resolution workflow.
    actions.push(...sportUmaActions(ctx));
  } else if (ctx.source === "manual" && ctx.manualLocalStatus) {
    // Manual markets with a backoffice DB row: gate on local_status, mirroring
    // the sport market flow.
    const ls = ctx.manualLocalStatus;
    const isTerminal =
      ls === "resolved" ||
      ls === "refunded" ||
      ls === "cancelled" ||
      ls === "failed";
    if (!isTerminal) {
      if ((ls === "created" || ls === "reset") && canProposeOnChain(ctx)) {
        actions.push("uma-propose");
      }
      if (ls === "proposed" || ls === "disputed") {
        actions.push("uma-resolve");
      }
    }
  } else {
    // UMA market (manual without a backoffice row): fall back to dpm-api status.
    const u = umaStatus(ctx.dpmMarket);
    if (!umaIsTerminal(u)) {
      if (canProposeOnChain(ctx)) {
        actions.push("uma-propose");
      }
      if (u === "PROPOSED" || u === "DISPUTED") {
        actions.push("uma-resolve");
      }
    }
  }

  // Generic lifecycle — available to every on-chain market regardless of
  // resolution type. Visibility flips on the boolean flags so we never offer
  // a no-op.
  const d = ctx.dpmMarket;
  if (d) {
    if (d.paused) actions.push("market-unpause");
    // Activate makes sense when the market isn't already active and the deploy
    // workflow finished (REGISTERED). The dpm-api handler validates the
    // deployment_status itself, so we just gate on the active flag.
    if (d.active === false) actions.push("market-activate");

    // Recover stuck CTF funds after a first-dispute DVM reset. Only sport and
    // manual markets have a backoffice ID that the endpoint requires; crypto
    // markets have no such ID so the action cannot be completed.
    if (
      d.settle_status === "settle_required" &&
      (ctx.sportMarketId !== undefined || ctx.manualMarketId !== undefined)
    ) {
      actions.push("uma-recover-funds");
    }
  }

  return actions;
}

// UMA actions for a sport market: gated on local_status, the authoritative
// source of truth, ANDed with the on-chain status the backoffice validates
// against. The operator is only offered what automation won't do.
function sportUmaActions(ctx: MarketActionCtx): MarketActionKey[] {
  const ls = ctx.sportLocalStatus;
  const isTerminal =
    ls === "resolved" ||
    ls === "refunded" ||
    ls === "cancelled" ||
    ls === "failed";
  if (!ls || isTerminal) return [];

  const actions: MarketActionKey[] = [];
  if (operatorMayProposeSport(ctx)) {
    actions.push("uma-propose");
  }
  // An external proposal no SportDecision settles waits for the operator's
  // call, as on a manual market: accept it here or dispute it below. Silence
  // past dispute_by makes the dispute-watch dispute on its own.
  if (ctx.sportMarketId !== undefined && awaitsExternalProposalDecision(ctx)) {
    actions.push("uma-accept-external-proposal");
  }
  // Dispute whatever proposal is live — ours or external — whenever the market
  // is proposed, whatever the game status.
  if (ctx.sportMarketId !== undefined && ls === "proposed") {
    actions.push("uma-dispute");
  }
  // uma-resolve is intentionally omitted for sport markets: the Temporal
  // workflow resolves automatically after the liveness window. Operators
  // should not manually trigger settlement.
  return actions;
}

// Propose is offered from "created" (no automated result yet, or a failed
// propose) and "reset" (a dispute cleared the last proposal) — except while
// the sports dispatcher is still about to propose this market by itself
// (sportAutoProposePending), which a manual button would only race. On top of
// that, the operator only proposes what automation won't: a game status Decide
// leaves open, or a reset the dispatcher will not re-propose.
function operatorMayProposeSport(ctx: MarketActionCtx): boolean {
  const ls = ctx.sportLocalStatus;
  return (
    (ls === "created" || ls === "reset") &&
    !ctx.sportAutoProposePending &&
    canProposeOnChain(ctx) &&
    (gameAwaitsOperatorProposal(ctx) || automaticProposeWillNotRetry(ctx))
  );
}

// ---------------------------------------------------------------------------
// Context builders and per-surface filters
// ---------------------------------------------------------------------------

export type SportMarketActionContext = Pick<
  MarketActionCtx,
  | "sportMarketId"
  | "sportLocalStatus"
  | "sportAutoProposePending"
  | "sportProposeExhausted"
  | "sportKey"
  | "sportFixtureStatus"
>;

// The sport-market slice of MarketActionCtx, derived from the backoffice sport
// event and the market's own row. Shared by the market page and the event
// page's inline panels so both apply exactly the same rules.
export function sportMarketActionContext(
  sportEvent: SportEvent | undefined,
  sportMarket: SportMarket | undefined,
): SportMarketActionContext {
  const decision = sportMarket
    ? sportEvent?.decisions?.find(
        (d) => d.sport_market_type_id === sportMarket.sport_market_type_id,
      )
    : undefined;
  // Whether the sports dispatcher (apps/backoffice/internal/scheduler/sports/
  // dispatcher.go) has already used this decision's one automatic propose
  // pass. propose_dispatched_at, once set, is never cleared again, so a sport
  // market currently local_status="reset" needs an operator only when its
  // decision's propose_dispatched_at is set — otherwise the 10s dispatcher
  // tick will auto re-propose it on its own shortly.
  const sportProposeExhausted = !!decision?.propose_dispatched_at;
  // While the decision is priced for this outcome and hasn't been dispatched
  // yet, the dispatcher will propose this market by itself, so the Actions
  // panel holds back a manual propose.
  const sportAutoProposePending =
    !!sportMarket &&
    decision?.proposed_prices?.[sportMarket.outcome_key] !== undefined &&
    !sportProposeExhausted;
  return {
    sportMarketId: sportMarket?.id,
    sportLocalStatus: sportMarket?.local_status,
    sportAutoProposePending,
    sportProposeExhausted,
    sportKey: sportEvent?.sport_key,
    sportFixtureStatus: sportEvent?.fixture_status_short,
  };
}

// Actions that review a live proposal — accepting or disputing it. The event
// page leaves them to the market page, which shows the proposal evidence.
export const PROPOSAL_REVIEW_ACTIONS: ReadonlySet<MarketActionKey> = new Set<MarketActionKey>([
  "uma-accept-external-proposal",
  "uma-dispute-external-proposal",
  "uma-dispute",
]);

export function withoutActions(
  actions: MarketActionKey[],
  hidden: ReadonlySet<MarketActionKey> | undefined,
): MarketActionKey[] {
  if (!hidden) return actions;
  return actions.filter((key) => !hidden.has(key));
}

// Human-facing copy for each action.
export const ACTION_META: Record<
  MarketActionKey,
  {
    label: string;
    tone: "primary" | "secondary" | "ghost" | "danger";
    title: string;
  }
> = {
  retry: {
    label: "Retry",
    tone: "primary",
    title: "Retry the deploy in place. Use when the failure was transient.",
  },
  recreate: {
    label: "Recreate",
    tone: "secondary",
    title:
      "Mark this market skipped and append a fresh row in the plan with a new external_id.",
  },
  "uma-propose": {
    label: "Propose price",
    tone: "primary",
    title:
      "Submit a UMA price proposal. Allowed only while uma_resolution_status is INITIALIZING.",
  },
  "uma-resolve": {
    label: "Settle",
    tone: "primary",
    title:
      "Settle the market after the UMA dispute window. Allowed when uma_resolution_status ∈ {PROPOSED, DISPUTED}.",
  },
  "uma-reset": {
    label: "Reset",
    tone: "secondary",
    title:
      "Reset the UMA question and re-request — used after a DVM-resolved UNKNOWN or to recover from a stuck state.",
  },
  "uma-resolve-manually": {
    label: "Resolve manually",
    tone: "danger",
    title:
      "Force-resolve via the UMA CTF Adapter's manual path (requires the market to be flagged). Destructive.",
  },
  "ctf-oracle-report-payouts": {
    label: "Report payouts",
    tone: "primary",
    title:
      "Admin-settle this managed-oracle market by reporting payouts. Pick the winning outcome.",
  },
  "market-unpause": {
    label: "Resume trading",
    tone: "secondary",
    title: "Flip paused=false on the market.",
  },
  "market-activate": {
    label: "Activate",
    tone: "primary",
    title:
      "Set active=true and open accepting_orders. Requires deployment_status=REGISTERED.",
  },
  "manual-watch-dispute": {
    label: "Watch dispute",
    tone: "secondary",
    title: "Start the DvmPollWorkflow to monitor the active dispute for this manual market.",
  },
  "uma-accept-external-proposal": {
    label: "Accept proposal",
    tone: "primary",
    title:
      "Let the outside proposal settle. Records the decision; the resolution workflow then waits out liveness and resolves the market.",
  },
  "uma-dispute-external-proposal": {
    label: "Dispute proposal",
    tone: "danger",
    title:
      "Challenge the outside proposal on-chain now, from the UMA_ADMIN wallet. The first dispute resets the question; the second sends it to the DVM.",
  },
  "uma-dispute": {
    label: "Dispute proposal",
    tone: "danger",
    title:
      "Dispute the proposal live on this market — ours or external — from the UMA_ADMIN wallet. The first dispute resets the question for a new proposal; the second sends it to the DVM.",
  },
  "uma-recover-funds": {
    label: "Recover funds",
    tone: "danger",
    title:
      "Trigger a RESOLVE workflow to settle stuck CTF funds after a first-dispute DVM reset. Only available when settle_status=settle_required.",
  },
};
