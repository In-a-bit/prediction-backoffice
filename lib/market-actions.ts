import type {
  DeployPlanMarket,
  DpmMarket,
  ManualMarketLocalStatus,
  MarketStatus,
  SportMarketStatus,
} from "./types";
import { isMarketDeployDeadlinePassed } from "./deploy-plan";
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
  | "manual-watch-dispute";

export type MarketActionCtx = {
  source: PlanSource;
  dpmMarket?: DpmMarket;
  verdictStatus?: MarketStatus;
  planMarket?: DeployPlanMarket;
  planExternalId?: string;
  sportMarketId?: number;
  sportLocalStatus?: SportMarketStatus;
  manualMarketId?: number;
  manualLocalStatus?: ManualMarketLocalStatus;
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

// CTF_ORACLE markets don't carry a per-status enum; once they're resolved on
// chain the dpm-api row is marked closed=true. Treat closed/archived as
// terminal so we stop offering "Report payouts".
function ctfIsTerminal(d?: DpmMarket): boolean {
  return !!(d?.closed || d?.archived);
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export function getAvailableActions(ctx: MarketActionCtx): MarketActionKey[] {
  const actions: MarketActionKey[] = [];

  // 1) Plan-phase actions while the deploy is still in flight.
  if (ctx.planMarket && ctx.planExternalId) {
    const s = ctx.planMarket.status;
    if (s === "failed") {
      if (!isMarketDeployDeadlinePassed(ctx.planMarket)) {
        actions.push("retry");
      }
      actions.push("recreate");
    }
  }

  // 2) Manual-market watch-dispute — available when the market is in the
  //     disputed phase and a backoffice manual_market row exists.
  if (ctx.source === "manual" && ctx.manualMarketId !== undefined) {
    if (ctx.manualLocalStatus === "disputed") {
      actions.push("manual-watch-dispute");
    }
  }

  // 3) On-chain lifecycle actions — gated on resolution_type and the dpm-api
  //    validators so we never offer something the backend would reject.
  if (!isOnChain(ctx)) return actions;

  // Resolution-type-specific actions.
  // Crypto markets are always CTF_ORACLE (resolved via the price-ticker
  // decision flow), never UMA — skip UMA actions regardless of what
  // dpm-api reports for resolution_type.
  if (isCtfOracle(ctx.dpmMarket) || ctx.source === "crypto") {
    if (!ctfIsTerminal(ctx.dpmMarket)) {
      actions.push("ctf-oracle-report-payouts");
    }
  } else if (ctx.source === "sport" && ctx.sportLocalStatus) {
    // Sport markets: gate UMA actions on local_status which is the authoritative
    // source of truth (mirrors uma_resolution_status but also tracks disputed states).
    const ls = ctx.sportLocalStatus;
    const isTerminal =
      ls === "resolved" ||
      ls === "refunded" ||
      ls === "cancelled" ||
      ls === "failed";
    if (!isTerminal) {
      if (ls === "created" || ls === "reset") {
        actions.push("uma-propose");
      }
      // uma-resolve is intentionally omitted for sport markets: the Temporal
      // workflow resolves automatically after the liveness window. Operators
      // should not manually trigger settlement.
      if (ls !== "proposing" && ls !== "resolving") {
        actions.push("uma-reset");
      }
    }
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
      if (ls === "created" || ls === "reset") {
        actions.push("uma-propose");
      }
      if (ls === "proposed" || ls === "disputed") {
        actions.push("uma-resolve");
      }
      if (ls !== "proposing" && ls !== "resolving") {
        actions.push("uma-reset");
      }
    }
  } else {
    // UMA market (manual without a backoffice row): fall back to dpm-api status.
    const u = umaStatus(ctx.dpmMarket);
    if (!umaIsTerminal(u)) {
      if (u === "INITIALIZING" || u === undefined) {
        actions.push("uma-propose");
      }
      if (u === "PROPOSED" || u === "DISPUTED") {
        actions.push("uma-resolve");
      }
      actions.push("uma-reset");
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
  }

  return actions;
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
};
