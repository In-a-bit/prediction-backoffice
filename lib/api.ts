import "server-only";

import type {
  Asset,
  CreateAssetRequest,
  CreateDeployPlanInput,
  CreateTaskRequest,
  CreatedMarket,
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

// ----- Reads -----

export const listAssets = () => request<Asset[]>("/assets");

export const listSupportedPairs = () =>
  request<SupportedPair[]>("/assets/supported");

export const listIntervals = () => request<Interval[]>("/intervals");

export const listTasks = (opts?: { withStats?: boolean }) =>
  request<Task[]>(opts?.withStats ? "/tasks?include=stats" : "/tasks");

export const getTask = (id: number | string) => request<Task>(`/tasks/${id}`);

export const listTaskMarkets = (id: number | string, limit = 50) =>
  request<CreatedMarket[]>(`/tasks/${id}/markets?limit=${limit}`);

// ----- Writes (protected) -----

export const createAsset = (body: CreateAssetRequest) =>
  request<Asset>("/assets", { method: "POST", body, authed: true });

export const updateAsset = (id: number, body: UpdateAssetRequest) =>
  request<Asset>(`/assets/${id}`, { method: "PATCH", body, authed: true });

export const createTask = (body: CreateTaskRequest) =>
  request<Task>("/tasks", { method: "POST", body, authed: true });

export const updateTask = (id: number, body: UpdateTaskRequest) =>
  request<Task>(`/tasks/${id}`, { method: "PATCH", body, authed: true });

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
