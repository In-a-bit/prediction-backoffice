// Shared DTO types mirroring the Go backoffice API responses
// (apps/backoffice/handlers/types.go in the prediction-bundler repo).

export type Asset = {
  id: number;
  created_at: string;
  updated_at: string;
  base: string;
  display_name: string;
  target: string;
  source_base: string;
  source_target: string;
  is_active: boolean;
};

export type SupportedPair = {
  base: string;
  target: string;
  source_base: string;
  source_target: string;
};

export type Interval = {
  id: number;
  label: string;
  tag_label: string;
  minutes: number;
};

export type TaskStats = {
  created_last_24h: number;
  failed_last_24h: number;
  pending_now: number;
  awaiting_verify_now: number;
  awaiting_price_count: number;
  awaiting_resolution: number;
  total_created: number;
  total_verified: number;
  next_slot_end?: string | null;
  last_created_at?: string | null;
  last_verified_at?: string | null;
  last_price_to_beat_at?: string | null;
};

export type Task = {
  id: number;
  created_at: string;
  updated_at: string;
  asset_id: number;
  interval_id: number;
  time_ahead_minutes: number;
  series_id: number;
  series_slug: string;
  first_market_at: string;
  is_create_active: boolean;
  is_resolve_active: boolean;
  tag_ids: number[];
  asset?: Asset;
  interval?: Interval;
  stats?: TaskStats;
};

export type CreatedMarketStatus = "PENDING" | "CREATED" | "FAILED";

export type CreatedMarket = {
  id: number;
  created_at: string;
  updated_at: string;
  slot_start: string;
  slot_end: string;
  slug: string;
  status: CreatedMarketStatus;
  verified_at?: string | null;
  price_to_beat?: string | null;
  market_external_id?: string | null;
  event_external_id?: string | null;
  error?: string | null;
};

export type CreateAssetRequest = {
  base: string;
  display_name: string;
  source_base: string;
  target?: string;
  source_target?: string;
  is_active?: boolean;
};

export type UpdateAssetRequest = {
  display_name?: string;
  is_active?: boolean;
};

export type CreateTaskRequest = {
  asset_id: number;
  interval_id: number;
  time_ahead_minutes: number;
  // ISO 8601. Optional — when omitted, the server uses the next aligned slot
  // end after now. When supplied it is snapped UP to the next interval
  // boundary by the server so alignment is preserved.
  first_market_at?: string;
  is_create_active?: boolean;
  is_resolve_active?: boolean;
};

export type UpdateTaskRequest = {
  time_ahead_minutes?: number;
  is_create_active?: boolean;
  is_resolve_active?: boolean;
};

// ---------------------------------------------------------------------------
// Manual creator — mirrors apps/backoffice/internal/dpmclient/types.go and
// apps/backoffice/handlers/manual*.go. Audit fields (correlation_id,
// parent_log_id, actor) live alongside the create payload at the top level.
// ---------------------------------------------------------------------------

export type ManualAudit = {
  // Free-form actor identifier. The backend defaults to "manual-operator"
  // when omitted; we surface the override so the UI can stamp e.g. an email
  // once a user system exists.
  actor?: string;
  // UUID grouping a multi-step action (slug-flow → series + event + N markets).
  // The UI generates this once at the start of an orchestrated submit.
  correlation_id?: string;
  // UUID of the operator_log row this action replaces (set on Recreate).
  parent_log_id?: string;
};

export type SeriesPayload = {
  slug: string;
  title: string;
  ticker?: string;
  description?: string;
  icon?: string;
  series_type?: string;
  recurrence?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  restricted?: boolean;
  featured?: boolean;
  new?: boolean;
  requires_translation?: boolean;
  comment_count?: number;
  metadata_type?: string;
  metadata?: Record<string, unknown>;
};

export type EventPayload = {
  slug: string;
  title: string;
  ticker?: string;
  description?: string;
  resolution_source?: string;
  start_date?: string; // ISO 8601
  end_date?: string;
  icon?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  restricted?: boolean;
  neg_risk?: boolean;
  neg_risk_market_id?: string;
  deployment_status?: "PENDING" | "DEPLOYING" | "DEPLOYED";
  deploying_timestamp?: string;
  parent_event_id?: number;
  comment_count?: number;
  series_id?: number;
  series_external_id?: string;
  metadata_type?: string;
  metadata?: Record<string, unknown>;
  tag_ids?: number[];
};

export type MarketPayload = {
  // Provide either event_id (numeric) or event_external_id (uuid string).
  event_id?: number;
  event_external_id?: string;

  question: string;
  slug?: string;
  description?: string;
  resolution_source?: string;
  start_date?: string;
  end_date?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  restricted?: boolean;
  accepting_orders?: boolean;
  accepting_orders_timestamp?: string;
  funded?: boolean;
  approved?: boolean;
  activation?: "AUTO" | "MANUAL";
  automatically_active?: boolean;
  clear_book_on_start?: boolean;
  rfq_enabled?: boolean;
  neg_risk?: boolean;
  neg_risk_market_id?: string;
  neg_risk_request_id?: string;
  neg_risk_other?: boolean;
  // Decimals serialized as strings to preserve precision through JSON.
  order_price_min_tick_size?: string;
  order_min_size?: number;
  uma_bond?: string;
  uma_reward?: string;
  uma_resolution_status?: string;
  liveness?: string;
  metadata_type?: string;
  metadata?: Record<string, unknown>;
};

export type SeriesResponse = {
  id: number;
  external_id: string;
  created_at: string;
  updated_at: string;
  slug: string;
  title: string;
  ticker?: string | null;
  description?: string | null;
  icon?: string | null;
  series_type: string;
  recurrence?: string | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  restricted: boolean;
  featured: boolean;
  new: boolean;
  comment_count: number;
  requires_translation: boolean;
  metadata_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type EventResponse = {
  id: number;
  external_id: string;
  created_at: string;
  updated_at: string;
  slug: string;
  title: string;
  ticker?: string | null;
  description?: string | null;
  resolution_source?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  icon?: string | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  restricted: boolean;
  paused: boolean;
  neg_risk: boolean;
  neg_risk_market_id?: string | null;
  comment_count: number;
  deployment_status: string;
  deploying_timestamp?: string | null;
  parent_event_id?: number | null;
  series_id?: number | null;
  metadata_type?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: TagResponse[];
};

export type TagResponse = {
  id: number;
  external_id: string;
  slug: string;
  label: string;
  force_show: boolean;
  force_hide: boolean;
  requires_translation: boolean;
};

// 202-Accepted body returned by POST /manual/markets. The market row only
// becomes visible via getMarketStatus once the deploy workflow's first
// activity inserts it.
export type MarketAccepted = {
  external_id: string;
  workflow_id: string;
  run_id: string;
  status: string;
};

// MarketStatusVerdict is the normalized poll result from
// GET /manual/markets/:external_id/status.
export type MarketStatus =
  | "deployed"
  | "deploying"
  | "running"
  | "waiting_for_balance"
  | "failed"
  | "pending";

export type PendingActivityInfo = {
  activity_type: string;
  attempt: number;
  state: string;
  last_failure?: string;
};

export type WorkflowStatus = {
  workflow_id: string;
  run_id?: string;
  status: string;
  started_at?: string;
  closed_at?: string;
  history_length?: number;
  error?: string;
  pending_activity?: PendingActivityInfo;
};

export type DpmMarket = {
  id: number;
  external_id: string;
  created_at: string;
  updated_at: string;
  event_id: number;
  question: string;
  slug?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  active: boolean;
  closed: boolean;
  deployment_status: string;
  uma_resolution_status?: string | null;
  metadata_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MarketStatusVerdict = {
  status: MarketStatus;
  external_id: string;
  workflow_id?: string;
  market?: DpmMarket;
  workflow?: WorkflowStatus;
  pending_activity?: PendingActivityInfo;
  error?: string;
  can_recreate: boolean;
};

export type OperatorLogEntry = {
  id: number;
  external_id: string;
  created_at: string;
  updated_at: string;
  actor: string;
  action:
    | "create_series"
    | "create_event"
    | "create_event_from_slug"
    | "create_event_from_description"
    | "create_market"
    | "signal_market_balance";
  resource_type: "series" | "event" | "market";
  resource_external_id?: string;
  workflow_id?: string;
  status:
    | "submitted"
    | "running"
    | "waiting_for_balance"
    | "succeeded"
    | "failed"
    | "skipped";
  error?: string;
  parent_log_id?: string;
  correlation_id?: string;
  request_payload?: unknown;
  response_payload?: unknown;
};

export type OperatorLogFilters = {
  resource_type?: "series" | "event" | "market";
  action?: OperatorLogEntry["action"];
  actor?: string;
  correlation_id?: string;
  status?: OperatorLogEntry["status"];
  limit?: number;
};

// ---------------------------------------------------------------------------
// Deploy plans — backend-driven market deploy queue. The plan + per-market
// state lives in Postgres; the UI is a thin observer over GET /deploy-plans.
// ---------------------------------------------------------------------------

export type DeployPlanStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export type DeployPlanMarketStatus =
  | "idle"
  | "submitting"
  | "running"
  | "waiting_for_balance"
  | "deployed"
  | "failed"
  | "skipped";

export type DeployPlanMarket = {
  id: number;
  position: number;
  status: DeployPlanMarketStatus;
  external_id?: string;
  workflow_id?: string;
  error?: string;
  question: string;
  parent_market_id?: number;
  request_payload?: unknown;
  created_at: string;
  updated_at: string;
};

export type DeployPlan = {
  id: number;
  external_id: string;
  created_at: string;
  updated_at: string;
  actor: string;
  correlation_id?: string;
  event_external_id: string;
  event_id?: number;
  status: DeployPlanStatus;
  note?: string;
  markets: DeployPlanMarket[];
};

export type CreateDeployPlanInput = ManualAudit & {
  event_external_id: string;
  event_id?: number;
  note?: string;
  markets: MarketPayload[];
};
