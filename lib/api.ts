import "server-only";

import type {
  Asset,
  CreateAssetRequest,
  CreateDeployPlanInput,
  CreateTaskRequest,
  CreatedMarket,
  CryptoEvent,
  DeployPlan,
  EventPayload,
  EventResponse,
  Interval,
  ManualAudit,
  MarketAccepted,
  MarketPayload,
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

const baseUrl = process.env.BACKOFFICE_API_URL ?? "http://localhost:8092";
const apiKey = process.env.BACKOFFICE_API_KEY ?? "";
const dpmUrl = process.env.DPM_API_URL ?? "http://localhost:8082";
const dpmApiKey = process.env.DPM_API_KEY ?? "";

type FetchOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  // When true, send the API key header. Required for all writes and any
  // protected reads.
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

async function request<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.authed) {
    if (!apiKey) {
      throw new Error("BACKOFFICE_API_KEY is required for this request");
    }
    headers["X-API-Key"] = apiKey;
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
  signalMarketBalance: (workflowId: string) =>
    request<{ status: string; workflow_id: string }>(
      "/manual/markets/signal-balance",
      {
        method: "POST",
        body: { workflow_id: workflowId },
        authed: true,
      },
    ),

  // ----- Audit log -----
  listOperatorLog: (filters: OperatorLogFilters = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    const qs = q.toString();
    return request<OperatorLogEntry[]>(
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
  listDeployPlans: (filters: { event_external_id?: string; status?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    const qs = q.toString();
    return request<DeployPlan[]>(
      `/manual/deploy-plans${qs ? `?${qs}` : ""}`,
    );
  },
  startDeployPlan: (externalId: string) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}/start`,
      { method: "POST", authed: true },
    ),
  pauseDeployPlan: (externalId: string) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}/pause`,
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
  skipPlanMarket: (externalId: string, position: number) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}/markets/${position}/skip`,
      { method: "POST", authed: true },
    ),
  signalPlanMarketBalance: (externalId: string, position: number) =>
    request<DeployPlan>(
      `/manual/deploy-plans/${encodeURIComponent(externalId)}/markets/${position}/signal-balance`,
      { method: "POST", authed: true },
    ),
};

// ---------------------------------------------------------------------------
// Sports — soccer/football today; the API surface is sport-agnostic so future
// sports drop in without new endpoints. Reuses the manual deploy-plan controls
// (start/pause/recreate/skip/signal-balance) via the existing manual.* methods.
// ---------------------------------------------------------------------------

import type {
  SportTask,
  SportEvent,
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
  listTasks: (opts?: { withStats?: boolean }) =>
    request<Task[]>(opts?.withStats ? "/crypto/tasks?include=stats" : "/crypto/tasks"),
  getTask: (id: number | string) =>
    request<Task>(`/crypto/tasks/${id}`),
  listTaskMarkets: (id: number | string, limit = 50) =>
    request<CreatedMarket[]>(`/crypto/tasks/${id}/markets?limit=${limit}`),
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
  opts: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (dpmApiKey) headers["X-API-Key"] = dpmApiKey;
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
      body: { market_id: market_external_id, proposer_address, proposed_price },
    }),
  umaResolve: (market_external_id: string) =>
    dpmRequest<DpmActionResult>(`/markets/uma/resolve`, {
      method: "POST",
      body: { market_id: market_external_id },
    }),
  umaReset: (market_external_id: string) =>
    dpmRequest<DpmActionResult>(`/markets/uma/reset`, {
      method: "POST",
      body: { market_id: market_external_id },
    }),
  umaResolveManually: (market_external_id: string, payouts: string[]) =>
    dpmRequest<DpmActionResult>(`/markets/uma/resolve-manually`, {
      method: "POST",
      body: { market_id: market_external_id, payouts },
    }),
  ctfOracleReportPayouts: (market_external_id: string, payouts: string[]) =>
    dpmRequest<DpmActionResult>(`/markets/ctf-oracle/report-payouts`, {
      method: "POST",
      body: { market_id: market_external_id, payouts },
    }),

  // --- Lifecycle (event & market pause/unpause/activate) ---
  // Event pause/unpause take the dpm numeric id. Activate is keyed by external_id.
  pauseEvent: (event_id: number) =>
    dpmRequest<DpmActionResult>(`/events/${event_id}/pause`, { method: "POST" }),
  unpauseEvent: (event_id: number) =>
    dpmRequest<DpmActionResult>(`/events/${event_id}/unpause`, { method: "POST" }),
  activateEvent: (event_external_id: string) =>
    dpmRequest<DpmActionResult>(
      `/events/by-external-id/${encodeURIComponent(event_external_id)}/activate`,
      { method: "POST" },
    ),
  deactivateEvent: (event_external_id: string) =>
    dpmRequest<DpmActionResult>(
      `/events/by-external-id/${encodeURIComponent(event_external_id)}/deactivate`,
      { method: "POST" },
    ),
  // Market pause/unpause/activate take the dpm numeric id.
  pauseMarket: (market_id: number) =>
    dpmRequest<DpmActionResult>(`/markets/${market_id}/pause`, { method: "POST" }),
  unpauseMarket: (market_id: number) =>
    dpmRequest<DpmActionResult>(`/markets/${market_id}/unpause`, { method: "POST" }),
  activateMarket: (market_id: number) =>
    dpmRequest<DpmActionResult>(`/markets/${market_id}/activate`, { method: "POST" }),
};
