import "server-only";

import { cookies } from "next/headers";

import type {
  Asset,
  CreateAssetRequest,
  CreateDeployPlanInput,
  CreateTaskRequest,
  CreatedMarket,
  CryptoEvent,
  DeployPlan,
  DpmMarket,
  EventPayload,
  EventResponse,
  Interval,
  ManualAudit,
  ManualEventListResponse,
  MarketAccepted,
  MarketPayload,
  MarketOutcome,
  MarketStatusVerdict,
  OperatorLogEntry,
  OperatorLogFilters,
  SeriesPayload,
  SeriesResponse,
  SupportedPair,
  TagResponse,
  Task,
  UpdateAssetRequest,
  UpdateTaskRequest,
} from "./types";

/** Paginated envelope returned by list endpoints that support offset-based paging. */
export type Paginated<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

const baseUrl = process.env.BACKOFFICE_API_URL ?? "http://localhost:8092";
const dpmUrl = process.env.DPM_API_URL ?? "http://localhost:8082";
// Admin key for dpm-api privileged writes (admin route group).
// Shared with other users of the dpm-api; do not rename.
const dpmApiKey = process.env.DPM_API_KEY ?? "";
// App key for dpm-api protected reads (standard route group): relayer-wallet
// listing, mnemonic status, wallet balances. Distinct secret from the admin key.
const dpmAppApiKey = process.env.DPM_APP_API_KEY ?? "";

type FetchOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  // Retained for call-site compatibility; auth is now carried by the forwarded
  // session cookie (see request()), not an API key. Ignored.
  authed?: boolean;
  // Cache control. Defaults to no-store so dashboard data is always fresh.
  cache?: RequestCache;
  // Optional Next.js revalidation tag for cache invalidation.
  tags?: string[];
};

export class BackofficeApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message?: string,
  ) {
    super(message ?? `backoffice api ${status}: ${body}`);
    this.name = "BackofficeApiError";
  }
}

/** A 401 from the backoffice means the session is missing/expired. */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof BackofficeApiError && err.status === 401;
}

async function request<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  // Forward the caller's backoffice session cookie so Go authenticates the
  // user, enforces RBAC, and attributes the audit actor. The browser only
  // talks to this Next BFF; we relay its predictionsession cookie to Go.
  const session = (await cookies()).get("predictionsession")?.value;
  if (session) {
    headers["Cookie"] = `predictionsession=${session}`;
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
    cache: opts.cache ?? "no-store",
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  if (opts.tags) (init as RequestInit & { next?: { tags: string[] } }).next = { tags: opts.tags };

  const res = await fetch(`${baseUrl}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new BackofficeApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Manual creator — series/event/market creation, status polling, audit log.
// All write calls accept an optional ManualAudit (correlation_id, actor,
// parent_log_id) so multi-step UI flows can group their writes in the log.
// ---------------------------------------------------------------------------

type ManualBody<P> = ManualAudit & { payload: P };

export const manual = {
  // ----- Series -----
  createSeries: (payload: SeriesPayload, audit: ManualAudit = {}) =>
    request<SeriesResponse>("/manual/series", {
      method: "POST",
      body: { ...audit, payload } satisfies ManualBody<SeriesPayload>,
      authed: true,
    }),
  getSeriesBySlug: (slug: string) =>
    request<SeriesResponse>(`/manual/series/by-slug/${encodeURIComponent(slug)}`),
  // Fuzzy search across series name + slug. Owned by prediction-bundler
  // (Phase 5 backend carve-out); until the endpoint lands the call returns
  // 404 and the caller (components/manual/series-search-select.tsx) falls
  // back to slug-exact lookup.
  searchSeries: (query: string, limit = 8) => {
    const q = new URLSearchParams({ q: query, limit: String(limit) });
    return request<SeriesResponse[]>(`/manual/series/search?${q.toString()}`);
  },

  // ----- Events -----
  createEvent: (payload: EventPayload, audit: ManualAudit = {}) =>
    request<EventResponse>("/manual/events", {
      method: "POST",
      body: { ...audit, payload } satisfies ManualBody<EventPayload>,
      authed: true,
    }),
  getEventByExternalId: (externalId: string) =>
    request<EventResponse>(
      `/manual/events/by-external-id/${encodeURIComponent(externalId)}`,
    ),
  listEvents: (opts?: { limit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.limit !== undefined) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return request<ManualEventListResponse>(`/manual/events${qs ? `?${qs}` : ""}`);
  },

  // ----- Tags -----
  upsertTag: (slug: string, label: string) =>
    request<TagResponse>("/manual/tags", {
      method: "POST",
      body: { slug, label },
      authed: true,
    }),

  // ----- Markets (async) -----
  createMarket: (payload: MarketPayload, audit: ManualAudit = {}) =>
    request<MarketAccepted>("/manual/markets", {
      method: "POST",
      body: { ...audit, payload } satisfies ManualBody<MarketPayload>,
      authed: true,
    }),
  getMarketStatus: (externalId: string) =>
    request<MarketStatusVerdict>(
      `/manual/markets/${encodeURIComponent(externalId)}/status`,
    ),
  // Proxies dpm-api's /markets/by-external-id/:id/outcome — returns the
  // proposed answer (UMA only) and per-token resolution winners.
  getMarketOutcome: (externalId: string) =>
    request<MarketOutcome>(
      `/manual/markets/${encodeURIComponent(externalId)}/outcome`,
    ),
  unpauseMarket: (externalId: string) =>
    request<void>(
      `/manual/markets/${encodeURIComponent(externalId)}/unpause`,
      { method: "POST", authed: true },
    ),
  activateMarket: (externalId: string) =>
    request<void>(
      `/manual/markets/${encodeURIComponent(externalId)}/activate`,
      { method: "POST", authed: true },
    ),
  umaResolveManually: (externalId: string, payouts: string[]) =>
    request<{ workflow_id?: string; status?: string }>(
      `/manual/markets/${encodeURIComponent(externalId)}/uma/resolve-manually`,
      { method: "POST", body: { payouts }, authed: true },
    ),
  umaPropose: (externalId: string, proposerAddress: string, proposedPrice: string) =>
    request<{ workflow_id?: string; status?: string }>(
      `/manual/markets/${encodeURIComponent(externalId)}/uma/propose`,
      {
        method: "POST",
        body: { proposer_address: proposerAddress, proposed_price: proposedPrice },
        authed: true,
      },
    ),
  umaReset: (externalId: string) =>
    request<{ workflow_id?: string; status?: string }>(
      `/manual/markets/${encodeURIComponent(externalId)}/uma/reset`,
      { method: "POST", authed: true },
    ),
  umaResolve: (externalId: string) =>
    request<{ workflow_id?: string; status?: string }>(
      `/manual/markets/${encodeURIComponent(externalId)}/uma/resolve`,
      { method: "POST", authed: true },
    ),
  ctfOracleReportPayouts: (externalId: string, payouts: string[]) =>
    request<{ workflow_id?: string; status?: string }>(
      `/manual/markets/${encodeURIComponent(externalId)}/ctf-oracle/report-payouts`,
      { method: "POST", body: { payouts }, authed: true },
    ),
  pauseEvent: (externalId: string) =>
    request<void>(
      `/manual/events/${encodeURIComponent(externalId)}/pause`,
      { method: "POST", authed: true },
    ),
  unpauseEvent: (externalId: string) =>
    request<void>(
      `/manual/events/${encodeURIComponent(externalId)}/unpause`,
      { method: "POST", authed: true },
    ),
  activateEvent: (externalId: string) =>
    request<void>(
      `/manual/events/${encodeURIComponent(externalId)}/activate`,
      { method: "POST", authed: true },
    ),
  deactivateEvent: (externalId: string) =>
    request<void>(
      `/manual/events/${encodeURIComponent(externalId)}/deactivate`,
      { method: "POST", authed: true },
    ),

  // ----- Audit log -----
  listOperatorLog: (filters: OperatorLogFilters & { offset?: number } = {}) => {    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    const qs = q.toString();
    return request<Paginated<OperatorLogEntry>>(
      `/manual/operator-log${qs ? `?${qs}` : ""}`,
    );
  },

  // ----- Deploy plans (durable, backend-driven market deploy queues) -----
  createDeployPlan: (input: CreateDeployPlanInput) =>
    request<DeployPlan>("/manual/deploy-plans", {
      method: "POST",
      body: input,
      authed: true,
    }),
  getDeployPlan: (externalId: string) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}`,
    ),
  listDeployPlans: (filters: { event_external_id?: string; status?: string; source?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    const qs = q.toString();
    return request<Paginated<DeployPlan>>(
      `/manual/deploy-plans${qs ? `?${qs}` : ""}`,
    );
  },
  startDeployPlan: (externalId: string) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}/start`,
      { method: "POST", authed: true },
    ),
  recreatePlanMarket: (externalId: string, position: number) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}/markets/${position}/recreate`,
      { method: "POST", authed: true },
    ),
  retryPlanMarket: (externalId: string, position: number) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}/markets/${position}/retry`,
      { method: "POST", authed: true },
    ),
  retryOperatorLog: (externalId: string) =>
    request<OperatorLogEntry>(
      `/manual/operator-log/${encodeURIComponent(externalId)}/retry`,
      { method: "POST", authed: true },
    ),
  // ----- Manual market resolution (backoffice DB table) -----
  listResolutionMarkets: (params?: {
    localStatus?: string;
    from?: number;
    limit?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.localStatus) p.set("local_status", params.localStatus);
    if (params?.from != null) p.set("from", String(params.from));
    if (params?.limit != null) p.set("limit", String(params.limit));
    const qs = p.toString();
    return request<import("./types").ManualResolutionList>(
      `/manual/resolutions${qs ? `?${qs}` : ""}`,
    );
  },
  listResolutionMarketCounts: () =>
    request<Record<string, number>>("/manual/resolutions/counts"),
  findManualMarketByExternalId: (externalId: string) =>
    request<{ id: number; local_status: string; manual_event_id: number }>(
      `/manual/backoffice-markets/find?external_id=${encodeURIComponent(externalId)}`,
    ),
  getManualMarketStatus: (id: number) =>
    request<Record<string, unknown>>(`/manual/backoffice-markets/${id}/status`),
  cancelManualMarket: (id: number, audit: { actor?: string } = {}) =>
    request<{ status: string }>(`/manual/backoffice-markets/${id}/cancel`, {
      method: "POST",
      body: audit,
      authed: true,
    }),
  manualUmaResolveManually: (id: number, payouts: string[], audit: { actor?: string } = {}) =>
    request<{ workflow_id: string; status: string }>(
      `/manual/backoffice-markets/${id}/uma/resolve-manually`,
      { method: "POST", body: { ...audit, payouts }, authed: true },
    ),
  manualUmaWatchDispute: (id: number, audit: { actor?: string } = {}) =>
    request<{ workflow_id: string; status: string }>(
      `/manual/backoffice-markets/${id}/uma/watch-dispute`,
      { method: "POST", body: audit, authed: true },
    ),
  triggerManualResolution: (manualMarketId: number, proposedPrice: string) =>
    request<{ workflow_id: string; run_id: string }>(
      `/manual/backoffice-markets/${manualMarketId}/trigger-resolution`,
      { method: "POST", body: { proposed_price: proposedPrice }, authed: true },
    ),
  recoverFunds: (manualMarketId: number, audit?: Record<string, unknown>) =>
    request<{ workflow_id: string; run_id: string }>(
      `/manual/backoffice-markets/${manualMarketId}/recover-funds`,
      { method: "POST", body: audit ?? {}, authed: true },
    ),
};

// ---------------------------------------------------------------------------
// Operator alerts — durable error/warning feed surfaced on /operations/alerts.
// The endpoints below are owned by prediction-bundler (see plan §Phase 1) and
// are wrapped by lib/observability/store.ts which transparently falls back to
// an in-process ring when they're unavailable. Importers should generally hit
// the store; only call these directly if you specifically want the remote.
// ---------------------------------------------------------------------------

import type {
  AlertCounts,
  AlertFilters,
  OperatorAlert,
} from "./observability/types";

function alertFiltersToQuery(filters: AlertFilters): string {
  const q = new URLSearchParams();
  const append = (k: string, v: string | number | boolean | undefined | null) => {
    if (v === undefined || v === null || v === "") return;
    q.append(k, String(v));
  };
  if (Array.isArray(filters.severity))
    filters.severity.forEach((s) => append("severity", s));
  else append("severity", filters.severity);
  if (Array.isArray(filters.source))
    filters.source.forEach((s) => append("source", s));
  else append("source", filters.source);
  if (Array.isArray(filters.resource_type))
    filters.resource_type.forEach((s) => append("resource_type", s));
  else append("resource_type", filters.resource_type);
  append("action", filters.action);
  if (filters.acknowledged !== undefined)
    append("acknowledged", filters.acknowledged);
  append("q", filters.q);
  append("since", filters.since);
  append("limit", filters.limit);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const alerts = {
  record: (alert: OperatorAlert) =>
    request<OperatorAlert>("/operations/alerts", {
      method: "POST",
      body: alert,
      authed: true,
    }),
  list: (filters: AlertFilters = {}) =>
    request<OperatorAlert[]>(`/operations/alerts${alertFiltersToQuery(filters)}`),
  counts: (filters: AlertFilters = {}) =>
    request<AlertCounts>(`/operations/alerts/counts${alertFiltersToQuery(filters)}`),
  acknowledge: (externalId: string, actor: string) =>
    request<OperatorAlert>(
      `/operations/alerts/${encodeURIComponent(externalId)}/acknowledge`,
      { method: "PATCH", body: { actor }, authed: true },
    ),
};

// ---------------------------------------------------------------------------
// Sports — soccer/football today; the API surface is sport-agnostic so future
// sports drop in without new endpoints. Reuses the manual deploy-plan controls
// (start/recreate/retry) via the existing manual.* methods.
// ---------------------------------------------------------------------------

import type {
  SportTask,
  SportEvent,
  SportResolutionList,
  CreateSportTaskInput,
  UpdateSportTaskInput,
  ApiFootballLeagueSearchResult,
} from "./types";

export const sports = {
  // Tasks (one row per sport+league+season automation config)
  listTasks: (sportKey?: string) => {
    const qs = sportKey ? `?sport_key=${encodeURIComponent(sportKey)}` : "";
    return request<SportTask[]>(`/sports/tasks${qs}`);
  },
  getTask: (id: number) =>
    request<SportTask>(`/sports/tasks/${id}`),
  createTask: (input: CreateSportTaskInput) =>
    request<SportTask>("/sports/tasks", {
      method: "POST",
      body: input,
      authed: true,
    }),
  updateTask: (id: number, patch: UpdateSportTaskInput) =>
    request<SportTask>(`/sports/tasks/${id}`, {
      method: "PATCH",
      body: patch,
      authed: true,
    }),
  addMarketType: (id: number, marketTypeKey: string, audit: { actor?: string } = {}) =>
    request<SportTask>(
      `/sports/tasks/${id}/market-types`,
      {
        method: "POST",
        body: { ...audit, market_type_key: marketTypeKey },
        authed: true,
      },
    ),
  removeMarketType: (id: number, typeId: number) =>
    request<SportTask>(
      `/sports/tasks/${id}/market-types/${typeId}`,
      { method: "DELETE", authed: true },
    ),

  // Events (one row per upstream fixture under a sport_task)
  listEvents: (sportTaskId: number, filter: { status?: string } = {}) => {
    const q = new URLSearchParams();
    if (filter.status) q.set("status", filter.status);
    const qs = q.toString();
    return request<SportEvent[]>(
      `/sports/tasks/${sportTaskId}/events${qs ? `?${qs}` : ""}`,
    );
  },
  getEvent: (id: number) =>
    request<SportEvent>(`/sports/events/${id}`),
  forceCreateEvent: (id: number, audit: { actor?: string } = {}) =>
    request<SportEvent>(`/sports/events/${id}/force-create`, {
      method: "POST",
      body: audit,
      authed: true,
    }),
  skipEvent: (id: number, audit: { actor?: string } = {}) =>
    request<{ status: string }>(`/sports/events/${id}/skip`, {
      method: "POST",
      body: audit,
      authed: true,
    }),

  // Markets (per-outcome)
  cancelMarket: (id: number, audit: { actor?: string } = {}) =>
    request<{ status: string }>(`/sports/markets/${id}/cancel`, {
      method: "POST",
      body: audit,
      authed: true,
    }),
  umaResolveManually: (id: number, payouts: string[], audit: { actor?: string } = {}) =>
    request<{ workflow_id: string; status: string }>(
      `/sports/markets/${id}/uma/resolve-manually`,
      { method: "POST", body: { ...audit, payouts }, authed: true },
    ),
  umaWatchDispute: (id: number, audit: { actor?: string } = {}) =>
    request<{ workflow_id: string; status: string }>(
      `/sports/markets/${id}/uma/watch-dispute`,
      { method: "POST", body: audit, authed: true },
    ),
  getMarketStatus: (id: number) =>
    request<Record<string, unknown>>(`/sports/markets/${id}/status`),
  findMarketByExternalId: (externalId: string) =>
    request<{ id: number; local_status: string; sport_event_id: number }>(
      `/sports/markets/find?external_id=${encodeURIComponent(externalId)}`,
    ),
  triggerResolution: (sportMarketId: number, proposedPrice: string) =>
    request<{ workflow_id: string; run_id: string }>(
      `/sports/markets/${sportMarketId}/trigger-resolution`,
      { method: "POST", body: { proposed_price: proposedPrice }, authed: true },
    ),
  recoverFunds: (sportMarketId: number, audit?: Record<string, unknown>) =>
    request<{ workflow_id: string; run_id: string }>(
      `/sports/markets/${sportMarketId}/recover-funds`,
      { method: "POST", body: audit ?? {}, authed: true },
    ),
  listResolutionMarkets: (params?: {
    localStatus?: string;
    from?: number;
    to?: number;
    limit?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.localStatus) p.set("local_status", params.localStatus);
    if (params?.from != null) p.set("from", String(params.from));
    if (params?.to != null) p.set("to", String(params.to));
    if (params?.limit != null) p.set("limit", String(params.limit));
    const qs = p.toString();
    return request<SportResolutionList>(`/sports/resolutions${qs ? `?${qs}` : ""}`);
  },
  listResolutionMarketCounts: () =>
    request<Record<string, number>>("/sports/resolutions/counts"),

  // League search (proxies api-football /leagues?search=)
  searchLeagues: (q: string, season?: number) => {
    const params = new URLSearchParams({ q });
    if (season) params.set("season", String(season));
    return request<ApiFootballLeagueSearchResult[]>(
      `/sports/leagues/search?${params.toString()}`,
    );
  },

  // Eager list of every league for a season — backs the new-config dropdown.
  // Optional country/type filters. Cached server-side for an hour per param set.
  listAllLeagues: (season: number, filters: { country?: string; type?: string } = {}) => {
    const params = new URLSearchParams({ season: String(season) });
    if (filters.country) params.set("country", filters.country);
    if (filters.type) params.set("type", filters.type);
    return request<ApiFootballLeagueSearchResult[]>(
      `/sports/leagues/all?${params.toString()}`,
    );
  },
};

// ---------------------------------------------------------------------------
// Crypto-interval — mirrors apps/backoffice/handlers/crypto_*.go. Single
// namespace covering the automation config (assets/intervals/tasks) and the
// per-slot crypto_events surface. The /deploy-plans page renders the
// DeployPlan that creates each market.
// ---------------------------------------------------------------------------

export const crypto = {
  // ----- Assets -----
  listAssets: () => request<Asset[]>("/crypto/assets"),
  listSupportedPairs: () =>
    request<SupportedPair[]>("/crypto/assets/supported"),
  createAsset: (body: CreateAssetRequest) =>
    request<Asset>("/crypto/assets", { method: "POST", body, authed: true }),
  updateAsset: (id: number, body: UpdateAssetRequest) =>
    request<Asset>(`/crypto/assets/${id}`, { method: "PATCH", body, authed: true }),

  // ----- Intervals -----
  listIntervals: () => request<Interval[]>("/crypto/intervals"),

  // ----- Tasks -----
  listTasks: (opts?: { withStats?: boolean; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (opts?.withStats) q.set("include", "stats");
    if (opts?.limit !== undefined) q.set("limit", String(opts.limit));
    if (opts?.offset !== undefined) q.set("offset", String(opts.offset));
    const qs = q.toString();
    return request<Paginated<Task>>(`/crypto/tasks${qs ? `?${qs}` : ""}`);
  },
  getTask: (id: number | string) =>
    request<Task>(`/crypto/tasks/${id}`),
  listTaskMarkets: (id: number | string, opts?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (opts?.limit !== undefined) q.set("limit", String(opts.limit));
    if (opts?.offset !== undefined) q.set("offset", String(opts.offset));
    const qs = q.toString();
    return request<Paginated<CreatedMarket>>(`/crypto/tasks/${id}/markets${qs ? `?${qs}` : ""}`);
  },
  createTask: (body: CreateTaskRequest) =>
    request<Task>("/crypto/tasks", { method: "POST", body, authed: true }),
  updateTask: (id: number, body: UpdateTaskRequest) =>
    request<Task>(`/crypto/tasks/${id}`, { method: "PATCH", body, authed: true }),

  // ----- Events -----
  listCryptoEvents: (cryptoTaskId: number) =>
    request<CryptoEvent[]>(`/crypto/tasks/${cryptoTaskId}/events`),
  getCryptoEvent: (id: number) =>
    request<CryptoEvent>(`/crypto/events/${id}`),
  forceCreateCryptoEvent: (id: number, audit: { actor?: string } = {}) =>
    request<CryptoEvent>(`/crypto/events/${id}/force-create`, {
      method: "POST",
      body: audit,
      authed: true,
    }),
  skipCryptoEvent: (id: number, audit: { actor?: string } = {}) =>
    request<{ status: string }>(`/crypto/events/${id}/skip`, {
      method: "POST",
      body: audit,
      authed: true,
    }),
};

// ---------------------------------------------------------------------------
// dpm-api — direct passthrough for on-chain market lifecycle actions. The Go
// backoffice doesn't proxy these, so we hit dpm-api straight from the route
// handlers. Mirrors the contract-tester repo (prediction-onchain-actions).
// ---------------------------------------------------------------------------

async function dpmRequest<T>(
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown; auth: "admin" | "app" },
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const apiKey = opts.auth === "app" ? dpmAppApiKey : dpmApiKey;
  if (apiKey) headers["X-API-Key"] = apiKey;
  const res = await fetch(`${dpmUrl}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new BackofficeApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type DpmActionResult = { workflow_id?: string; status?: string };

export const dpm = {
  // --- Resolution actions ---
  // Submit a UMA price proposal. proposed_price is a wei-encoded integer string;
  // typical values are "0" (NO), "1000000000000000000" (YES), or
  // "57896044618658097711785492504343953926634992332820282019728792003956564819968" (UNKNOWN).
  umaPropose: (market_external_id: string, proposer_address: string, proposed_price: string) =>
    dpmRequest<DpmActionResult>(`/markets/uma/propose`, {
      method: "POST",
      auth: "admin",
      body: { market_id: market_external_id, proposer_address, proposed_price },
    }),
  umaResolve: (market_external_id: string) =>
    dpmRequest<DpmActionResult>(`/markets/uma/resolve`, {
      method: "POST",
      auth: "admin",
      body: { market_id: market_external_id },
    }),
  umaReset: (market_external_id: string) =>
    dpmRequest<DpmActionResult>(`/markets/uma/reset`, {
      method: "POST",
      auth: "admin",
      body: { market_id: market_external_id },
    }),
  umaResolveManually: (market_external_id: string, payouts: string[]) =>
    dpmRequest<DpmActionResult>(`/markets/uma/resolve-manually`, {
      method: "POST",
      auth: "admin",
      body: { market_id: market_external_id, payouts },
    }),
  ctfOracleReportPayouts: (market_external_id: string, payouts: string[]) =>
    dpmRequest<DpmActionResult>(`/markets/ctf-oracle/report-payouts`, {
      method: "POST",
      auth: "admin",
      body: { market_id: market_external_id, payouts },
    }),

  // --- Lifecycle (event & market pause/unpause/activate) ---
  // Event pause/unpause take the dpm numeric id. Activate is keyed by external_id.
  pauseEvent: (event_id: number) =>
    dpmRequest<DpmActionResult>(`/events/${event_id}/pause`, { method: "POST", auth: "admin" }),
  unpauseEvent: (event_id: number) =>
    dpmRequest<DpmActionResult>(`/events/${event_id}/unpause`, { method: "POST", auth: "admin" }),
  activateEvent: (event_external_id: string) =>
    dpmRequest<DpmActionResult>(
      `/events/by-external-id/${encodeURIComponent(event_external_id)}/activate`,
      { method: "POST", auth: "admin" },
    ),
  deactivateEvent: (event_external_id: string) =>
    dpmRequest<DpmActionResult>(
      `/events/by-external-id/${encodeURIComponent(event_external_id)}/deactivate`,
      { method: "POST", auth: "admin" },
    ),
  // Market unpause/activate take the dpm numeric id.
  unpauseMarket: (market_id: number) =>
    dpmRequest<DpmActionResult>(`/markets/${market_id}/unpause`, { method: "POST", auth: "admin" }),
  activateMarket: (market_id: number) =>
    dpmRequest<DpmActionResult>(`/markets/${market_id}/activate`, { method: "POST", auth: "admin" }),
};

// ---------------------------------------------------------------------------
// Admin — HD mnemonic + relayer-wallet initialization. Talks to dpm-api's
// relayer-wallet handlers. Reads use the app key (standard group), writes use
// the admin key (admin group). Ported from prediction-onchain-actions.
// ---------------------------------------------------------------------------

export type MnemonicStatus = {
  exists: boolean;
  max_used_index: number;
  created_at?: string;
};

export type WalletType =
  | "TREASURY_ADMIN"
  | "FEE_ADMIN"
  | "CTF_ADMIN"
  | "UMA_ADMIN"
  | "RELAYER_ADMIN"
  | "ORACLE_ADMIN";

export type InitRelayerWalletResponse = {
  address: string;
  type: WalletType;
  initStatus: "PENDING" | "IN_PROGRESS" | "FAILED" | "COMPLETED";
  wallet_id: number;
  workflow_id: string;
};

export type RelayerWallet = {
  id: number;
  created_at?: string;
  updated_at?: string;
  address: string;
  wallet_type: WalletType;
  status: string;
  init_status?: "PENDING" | "IN_PROGRESS" | "FAILED" | "COMPLETED";
  init_error?: string;
  current_nonce: number;
  label?: string;
  is_active: boolean;
  workflow_id?: string;
};

export type RelayerWalletListParams = {
  limit?: number;
  offset?: number;
  address?: string;
  wallet_type?: string;
  label?: string;
};

export type AssetBalance = {
  symbol: string;
  contract_address?: string;
  decimals: number;
  balance_raw: string;
  balance_normalized: string;
  max_withdrawable_raw: string;
};

export type WalletBalances = {
  wallet_id: number;
  address: string;
  chain_id: string;
  pol: AssetBalance;
  collateral: AssetBalance;
  gas: {
    pol_transfer_gas_limit: number;
    max_fee_per_gas: string;
    max_priority_fee_per_gas: string;
    pol_gas_reservation_wei: string;
  };
};

export type WithdrawAsset = "POL" | "COLLATERAL";

export type WithdrawPayload = {
  asset: WithdrawAsset;
  to: string;
  amount_raw?: string;
  max?: boolean;
};

export type WithdrawResult = {
  tx_hash: string;
  nonce: number;
  status: "PENDING" | "MINED" | "REVERTED";
  block_number?: string;
  amount_raw: string;
};

function relayerWalletQuery(params: RelayerWalletListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Contracts — infrastructure contract registry (USDC.e, CTF, exchanges,
// oracles, treasury, …). Goes through the Go backoffice proxy
// (/proxy/dpm/contracts), which holds the dpm-api keys, enforces RBAC, and
// audits the create. List = read; create = wallet admin.
// ---------------------------------------------------------------------------

export type Contract = {
  id: number;
  created_at?: string;
  address: string;
  name: string;
  contract_type: string;
};

export type CreateContractInput = {
  address: string;
  name: string;
  contract_type: string;
};

export const contracts = {
  list: () => request<Contract[]>("/proxy/dpm/contracts"),
  create: (input: CreateContractInput) =>
    request<Contract>("/proxy/dpm/contracts", { method: "POST", body: input }),
};

// Mnemonic + relayer-wallet reads/writes go through the Go backoffice proxy
// (/proxy/dpm/relayer-wallets*), which holds the dpm-api keys, enforces RBAC
// (reads = wallets.read, writes = wallets.admin, withdraw = treasury.withdraw),
// and audits every write — same model as the contracts registry above. The
// session cookie is forwarded by request(); no dpm-api key touches the BFF.
export const admin = {
  getMnemonicStatus: () =>
    request<MnemonicStatus>(`/proxy/dpm/relayer-wallets/mnemonic`),
  initMnemonic: () =>
    request<MnemonicStatus>(`/proxy/dpm/relayer-wallets/mnemonic/init`, { method: "POST" }),

  listRelayerWallets: (params: RelayerWalletListParams = {}) =>
    request<Paginated<RelayerWallet> & { total_pages?: number }>(
      `/proxy/dpm/relayer-wallets${relayerWalletQuery(params)}`,
    ),
  initRelayerWallet: (payload: { type: WalletType; label?: string }) =>
    request<InitRelayerWalletResponse>(`/proxy/dpm/relayer-wallets/init`, {
      method: "POST",
      body: payload,
    }),
  deactivateRelayerWallet: (id: number) =>
    request<RelayerWallet>(`/proxy/dpm/relayer-wallets/${id}/deactivate`, { method: "POST" }),
  activateRelayerWallet: (id: number) =>
    request<RelayerWallet>(`/proxy/dpm/relayer-wallets/${id}/activate`, { method: "POST" }),

  getRelayerWalletBalances: (id: number) =>
    request<WalletBalances>(`/proxy/dpm/relayer-wallets/${id}/balances`),
  withdrawFromRelayerWallet: (id: number, payload: WithdrawPayload) =>
    request<WithdrawResult>(`/proxy/dpm/relayer-wallets/${id}/withdraw`, {
      method: "POST",
      body: payload,
    }),
};

export type LiquidityProviderRow = {
  id: number;
  name: string;
  email: string;
  max_addresses: number;
  is_active: boolean;
  private_api_key?: string;
  created_at: string;
  updated_at: string;
};

export type CreateLiquidityProviderInput = {
  name: string;
  email: string;
  max_addresses?: number;
};

export type UpdateLiquidityProviderInput = {
  name?: string;
  email?: string;
  is_active?: boolean;
  max_addresses?: number;
};

function liquidityProviderQuery(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const liquidityProviders = {
  list: (params: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) =>
    request<Paginated<LiquidityProviderRow>>(
      `/proxy/dpm/liquidity-providers${liquidityProviderQuery(params)}`,
    ),
  create: (input: CreateLiquidityProviderInput) =>
    request<LiquidityProviderRow>("/proxy/dpm/liquidity-providers", {
      method: "POST",
      body: input,
    }),
  update: (id: number, patch: UpdateLiquidityProviderInput) =>
    request<LiquidityProviderRow>(`/proxy/dpm/liquidity-providers/${id}`, {
      method: "PATCH",
      body: patch,
    }),
  createKey: (id: number) =>
    request<LiquidityProviderRow>(
      `/proxy/dpm/liquidity-providers/${id}/api-keys`,
      { method: "POST" },
    ),
  revokeKey: (id: number) =>
    request<{ revoked: boolean }>(
      `/proxy/dpm/liquidity-providers/${id}/api-keys/revoke`,
      { method: "PATCH" },
    ),
};

export type BuilderRow = {
  id: number;
  name: string;
  wallet_type: string;
  wallet_public_key: string;
  // Active publishable API key (pk_builder_…); "" when the builder has no active key.
  api_public_key: string;
  created_at: string;
  updated_at: string;
};

export type CreateBuilderInput = {
  name: string;
  wallet_public_key: string;
  wallet_secret_key: string;
  wallet_verification_key?: string;
};

export type CreateBuilderResult = { api_public_key: string };

function builderQuery(params: { search?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const builders = {
  list: (params: { search?: string; limit?: number; offset?: number } = {}) =>
    request<Paginated<BuilderRow>>(`/proxy/dpm/builders${builderQuery(params)}`),
  create: (input: CreateBuilderInput) =>
    request<CreateBuilderResult>("/proxy/dpm/builders", {
      method: "POST",
      // wallet_type is fixed for now; the dpm-api accepts it in the body.
      body: { ...input, wallet_type: "privy_proxy" },
    }),
};

// ---------------------------------------------------------------------------
// Auth / access control — the current session, users, roles, the permission
// catalog, and the audit log. Login/logout live in route handlers because they
// set/clear the session cookie.
// ---------------------------------------------------------------------------

import type {
  AuditRow,
  Me,
  Permission,
  PermissionCatalogDomain,
  RoleRow,
  UserRow,
} from "./auth";

export const auth = {
  me: () => request<Me>("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    request<{ status: string }>("/auth/change-password", {
      method: "POST",
      body: { current_password, new_password },
    }),
};

export const users = {
  list: () => request<{ data: UserRow[] }>("/auth/users").then((r) => r.data),
  get: (id: number) => request<UserRow>(`/auth/users/${id}`),
  create: (input: { email: string; password: string; role_ids: number[] }) =>
    request<UserRow>("/auth/users", { method: "POST", body: input }),
  update: (
    id: number,
    patch: { is_active?: boolean; role_ids?: number[]; new_password?: string },
  ) => request<UserRow>(`/auth/users/${id}`, { method: "PATCH", body: patch }),
};

export const roles = {
  list: () => request<{ data: RoleRow[] }>("/auth/roles").then((r) => r.data),
  permissions: () =>
    request<{ data: PermissionCatalogDomain[] }>("/auth/permissions").then(
      (r) => r.data,
    ),
  create: (input: {
    name: string;
    description?: string;
    permissions: Permission[];
  }) => request<RoleRow>("/auth/roles", { method: "POST", body: input }),
  update: (
    id: number,
    patch: { description?: string; permissions?: Permission[] },
  ) => request<RoleRow>(`/auth/roles/${id}`, { method: "PATCH", body: patch }),
  remove: (id: number) =>
    request<{ status: string }>(`/auth/roles/${id}`, { method: "DELETE" }),
};

export const audit = {
  list: (
    filters: {
      action?: string;
      resource_type?: string;
      actor_email?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    const qs = q.toString();
    return request<{
      data: AuditRow[];
      total: number;
      limit: number;
      offset: number;
    }>(`/audit${qs ? `?${qs}` : ""}`);
  },
  // record() is used by route handlers to log wallet/treasury actions that
  // bypass Go (Next → dpm-api direct). The actor is taken from the session.
  record: (entry: {
    action: string;
    resource_type?: string;
    resource_id?: string;
    params?: Record<string, unknown>;
    result_status?: number;
    error?: string;
  }) => request<{ status: string }>("/audit", { method: "POST", body: entry }),
};
