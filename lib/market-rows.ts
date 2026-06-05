import "server-only";

import { acceptingOrdersFlag } from "./aggregations";
import { crypto, manual, sports } from "./api";
import { derive, type Lifecycle, type Result } from "./market-lifecycle";
import { inferSourceFromPlan, type PlanSource } from "./source-from-plan";
import type {
  CryptoEvent,
  CryptoMarket,
  DeployPlan,
  DeployPlanMarket,
  DpmMarket,
  EventResponse,
  MarketStatusVerdict,
  SportEvent,
  SportMarket,
  Task,
  TokenOutcome,
} from "./types";

// Shared market loader powering /markets, /resolutions, and /operations.
// Returns the same flat row shape across all three sources, with optional
// hydration of dpm-api fields for the visible window. Centralised here so
// every page that asks "what markets exist?" answers consistently.

export type AcceptingFlag = "open" | "pending" | "closed";

export type MarketRow = {
  market_external_id: string;
  question: string;
  source: PlanSource;
  event_external_id: string | null;
  event_title: string | null;
  series_slug: string | null;
  created_at: string;
  plan_external_id?: string;
  position?: number;
  sport_market_id?: number;
  crypto_event_id?: number;
  active: boolean | null;
  closed: boolean | null;
  accepting: AcceptingFlag | null;
  accepting_orders_at: string | null;
  local_status: string | null;
  uma_resolution_status: string | null;
  uma_resolution_statuses: string[] | null;
  closed_time: string | null;
  lifecycle: Lifecycle;
  result: Result;
  sortKey: number;
};

export type LoadOptions = {
  // Restrict to a specific source. Defaults to "all".
  source?: "all" | PlanSource;
  // How many manual deploy plans to scan.
  planLimit?: number;
  // How many tasks per crypto/sport source to scan.
  taskLimit?: number;
  // Cap on per-task event/market scanning.
  marketsPerTask?: number;
  // Cap on hydration roundtrips. Markets past this index keep null fields.
  hydrationCap?: number;
  // Free-text search query. When non-empty, scan limits are expanded and rows
  // are filtered before hydration so the full dataset is searched.
  q?: string;
};

const DEFAULTS: Required<LoadOptions> = {
  source: "all",
  planLimit: 50,
  taskLimit: 5,
  marketsPerTask: 20,
  hydrationCap: 80,
  q: "",
};

export async function loadMarketRows(
  opts: LoadOptions = {},
): Promise<{
  rows: MarketRow[];
  series: string[];
  umaStatuses: string[];
  error: string | null;
}> {
  const cfg = { ...DEFAULTS, ...opts };

  // Expand scan limits when a search query is present so we cover the full
  // dataset rather than just the first page window.
  if (cfg.q) {
    cfg.planLimit = opts.planLimit ?? 2000;
    cfg.taskLimit = opts.taskLimit ?? 50;
    cfg.marketsPerTask = opts.marketsPerTask ?? 500;
  }

  try {
    const loaders: Promise<MarketRow[]>[] = [];
    if (cfg.source === "all" || cfg.source === "manual")
      loaders.push(manualRows(cfg.planLimit));
    if (cfg.source === "all" || cfg.source === "crypto")
      loaders.push(cryptoRows(cfg.taskLimit, cfg.marketsPerTask));
    if (cfg.source === "all" || cfg.source === "sport")
      loaders.push(sportRows(cfg.taskLimit, cfg.marketsPerTask));
    const lists = await Promise.all(loaders);
    let rows = lists.flat();

    const byKey = new Map<string, MarketRow>();
    for (const r of rows) {
      const key = `${r.source}:${r.market_external_id}`;
      const existing = byKey.get(key);
      if (!existing || preferRow(r, existing)) byKey.set(key, r);
    }
    rows = [...byKey.values()].sort((a, b) => b.sortKey - a.sortKey);

    // Filter before hydration so we don't make expensive DPM API calls for
    // rows that won't appear in the results.
    if (cfg.q) {
      const query = cfg.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.question?.toLowerCase().includes(query) ||
          r.market_external_id?.toLowerCase().includes(query) ||
          r.event_external_id?.toLowerCase().includes(query) ||
          r.event_title?.toLowerCase().includes(query) ||
          r.series_slug?.toLowerCase().includes(query),
      );
    }

    rows = await hydrate(rows, cfg.hydrationCap);
    rows = await hydrateSportOutcomes(rows);

    const seriesSet = new Set<string>();
    const umaSet = new Set<string>();
    for (const r of rows) {
      if (r.series_slug) seriesSet.add(r.series_slug);
      if (r.uma_resolution_status) umaSet.add(r.uma_resolution_status);
    }
    return {
      rows,
      series: [...seriesSet].sort((a, b) => a.localeCompare(b)),
      umaStatuses: [...umaSet].sort((a, b) => a.localeCompare(b)),
      error: null,
    };
  } catch (err) {
    return {
      rows: [],
      series: [],
      umaStatuses: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hydrate(rows: MarketRow[], cap: number): Promise<MarketRow[]> {
  // Only hydrate rows that have a real dpm UUID — fallback IDs like
  // "crypto-42" or "sport-7" are not valid and will be rejected by dpm-api.
  const head = rows.slice(0, cap).filter((r) => UUID_RE.test(r.market_external_id));
  const verdicts = await Promise.all(
    head.map(async (r) => {
      try {
        return [r.market_external_id, await manual.getMarketStatus(r.market_external_id)] as const;
      } catch {
        return null;
      }
    }),
  );
  const verdictMap = new Map<string, MarketStatusVerdict>();
  for (const v of verdicts) if (v) verdictMap.set(v[0], v[1]);

  const eventIds = [
    ...new Set(rows.map((r) => r.event_external_id).filter((x): x is string => !!x)),
  ].slice(0, cap);
  const events = await Promise.all(
    eventIds.map(async (id) => {
      try {
        return [id, await manual.getEventByExternalId(id)] as const;
      } catch {
        return null;
      }
    }),
  );
  const eventMap = new Map<string, EventResponse>();
  for (const e of events) if (e) eventMap.set(e[0], e[1]);

  return rows.map((row) => {
    const verdict = verdictMap.get(row.market_external_id);
    const event = row.event_external_id ? eventMap.get(row.event_external_id) : undefined;
    const dpm: DpmMarket | undefined = verdict?.market;
    const accepting = dpm ? acceptingOrdersFlag(dpm) : row.accepting;
    return {
      ...row,
      active: dpm?.active ?? row.active,
      closed: dpm?.closed ?? row.closed,
      accepting,
      accepting_orders_at:
        dpm?.accepting_orders_timestamp ?? row.accepting_orders_at,
      uma_resolution_status:
        dpm?.uma_resolution_status ?? row.uma_resolution_status,
      uma_resolution_statuses:
        dpm?.uma_resolution_statuses ?? row.uma_resolution_statuses,
      closed_time:
        dpm?.closed && dpm?.end_date ? dpm.end_date : row.closed_time,
      event_title: event?.title?.trim() || event?.slug?.trim() || row.event_title,
      series_slug:
        (event?.metadata?.series_slug as string | undefined) ?? row.series_slug,
    };
  });
}

function preferRow(a: MarketRow, b: MarketRow): boolean {
  const ar = a.result.kind !== "na";
  const br = b.result.kind !== "na";
  if (ar !== br) return ar;
  return a.sortKey > b.sortKey;
}

// ----- per-source loaders -----

async function manualRows(planLimit: number): Promise<MarketRow[]> {
  let plans: DeployPlan[];
  try {
    plans = (await manual.listDeployPlans({ limit: planLimit })).data;
  } catch {
    return [];
  }
  const out: MarketRow[] = [];
  for (const plan of plans) {
    if (inferSourceFromPlan(plan) !== "manual") continue;
    for (const m of plan.markets) out.push(rowFromManual(m, plan));
  }
  return out;
}

function rowFromManual(m: DeployPlanMarket, plan: DeployPlan): MarketRow {
  const { lifecycle, result } = derive({ source: "manual", planMarket: m });
  return {
    market_external_id: m.external_id ?? `pos-${plan.id}-${m.position}`,
    question: m.question,
    source: "manual",
    event_external_id: plan.event_external_id,
    event_title: null,
    series_slug: null,
    created_at: m.created_at,
    plan_external_id: plan.external_id,
    position: m.position,
    active: null,
    closed: null,
    accepting: null,
    accepting_orders_at: null,
    local_status: null,
    uma_resolution_status: null,
    uma_resolution_statuses: null,
    closed_time: null,
    lifecycle,
    result,
    sortKey: new Date(m.updated_at).getTime(),
  };
}

async function cryptoRows(
  taskLimit: number,
  marketsPerTask: number,
): Promise<MarketRow[]> {
  let tasks: Task[];
  try {
    tasks = (await crypto.listTasks()).data;
  } catch {
    return [];
  }
  const subset = tasks.slice(0, taskLimit);
  const events = await Promise.all(
    subset.map((t) =>
      crypto.listCryptoEvents(t.id).catch(() => [] as CryptoEvent[]),
    ),
  );
  const out: MarketRow[] = [];
  for (const list of events) {
    for (const ev of list) {
      for (const m of (ev.markets ?? []).slice(0, marketsPerTask)) {
        out.push(rowFromCrypto(m, ev));
      }
    }
  }
  return out;
}

function rowFromCrypto(m: CryptoMarket, ev: CryptoEvent): MarketRow {
  const { lifecycle, result } = derive({
    source: "crypto",
    cryptoMarket: m,
    cryptoEvent: ev,
  });
  return {
    market_external_id: m.market_external_id ?? `crypto-${m.id}`,
    question: m.market_slug,
    source: "crypto",
    event_external_id: ev.event_external_id ?? null,
    event_title: ev.event_slug,
    series_slug: null,
    created_at: m.created_at,
    plan_external_id: m.deploy_plan_external_id,
    position: m.deploy_plan_position,
    crypto_event_id: ev.id,
    active: null,
    closed: null,
    accepting: null,
    accepting_orders_at: null,
    local_status: m.local_status,
    uma_resolution_status: null,
    uma_resolution_statuses: null,
    closed_time: null,
    lifecycle,
    result,
    sortKey: new Date(ev.slot_end ?? ev.slot_start ?? m.updated_at).getTime(),
  };
}

async function sportRows(
  taskLimit: number,
  marketsPerTask: number,
): Promise<MarketRow[]> {
  let tasks: Awaited<ReturnType<typeof sports.listTasks>>;
  try {
    tasks = await sports.listTasks();
  } catch {
    return [];
  }
  const subset = tasks.slice(0, taskLimit);
  const events = await Promise.all(
    subset.map((t) =>
      sports.listEvents(t.id).catch(() => [] as SportEvent[]),
    ),
  );
  const out: MarketRow[] = [];
  for (const list of events) {
    for (const ev of list) {
      for (const m of (ev.markets ?? []).slice(0, marketsPerTask)) {
        out.push(rowFromSport(m, ev));
      }
    }
  }
  return out;
}

// After hydrate() fills uma_resolution_status, fetch token outcomes for sport
// markets that dpm-api considers resolved. local_status stays "created" forever
// so we can't use it — uma_resolution_status is the authoritative signal.
async function hydrateSportOutcomes(rows: MarketRow[]): Promise<MarketRow[]> {
  const UMA_RESOLVED = new Set(["RESOLVED", "MANUALLY_RESOLVED"]);
  const targets = rows.filter(
    (r) =>
      r.source === "sport" &&
      UUID_RE.test(r.market_external_id) &&
      r.uma_resolution_status !== null &&
      UMA_RESOLVED.has((r.uma_resolution_status ?? "").toUpperCase()),
  );
  if (targets.length === 0) return rows;

  const fetched = await Promise.all(
    targets.map((r) => manual.getMarketOutcome(r.market_external_id).catch(() => null)),
  );
  const outcomeMap = new Map(
    targets.flatMap((r, i) => (fetched[i] ? [[r.market_external_id, fetched[i]!]] : [])),
  );

  return rows.map((row) => {
    const outcome = outcomeMap.get(row.market_external_id);
    if (!outcome) return row;
    return { ...row, result: resultFromTokens(outcome.tokens) };
  });
}

function resultFromTokens(tokens: TokenOutcome[]): Result {
  const anyResolved = tokens.some(
    (t) => t.winner !== null && t.winner !== undefined,
  );
  if (!anyResolved) return { kind: "pending", label: "Pending" };

  const winners = tokens.filter((t) => t.winner === true);

  // DVM voted "unknown" → both tokens receive 50 % each.
  if (winners.length > 1) return { kind: "refund", label: "50/50" };

  // No winner but some tokens are resolved → explicit refund / void.
  if (winners.length === 0) return { kind: "refund", label: "Refund" };

  // tokens[0] is the YES side. Use the winning token's outcome label directly
  // so operators see e.g. "YES" / "NO" rather than generic "Won" / "Lost".
  const win = winners[0];
  const kind = tokens.indexOf(win) === 0 ? "won" : "lost";
  return { kind, label: win.outcome.toUpperCase() };
}

function rowFromSport(m: SportMarket, ev: SportEvent): MarketRow {
  const { lifecycle, result } = derive({
    source: "sport",
    sportMarket: m,
    sportEvent: ev,
  });
  return {
    market_external_id: m.market_external_id ?? `sport-${m.id}`,
    question: m.market_slug,
    source: "sport",
    event_external_id: ev.event_external_id ?? null,
    event_title: ev.event_slug,
    series_slug: null,
    created_at: m.created_at,
    plan_external_id: m.deploy_plan_external_id,
    position: m.deploy_plan_position,
    sport_market_id: m.id,
    active: null,
    closed: null,
    accepting: null,
    accepting_orders_at: null,
    local_status: m.local_status,
    uma_resolution_status: null,
    uma_resolution_statuses: null,
    closed_time: null,
    lifecycle,
    result,
    sortKey: new Date(ev.kickoff_at ?? m.updated_at).getTime(),
  };
}
