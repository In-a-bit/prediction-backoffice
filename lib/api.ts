import "server-only";

import type {
  Asset,
  CreateAssetRequest,
  CreateTaskRequest,
  CreatedMarket,
  Interval,
  SupportedPair,
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
