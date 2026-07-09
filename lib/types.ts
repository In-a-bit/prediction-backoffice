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
  total_resolved: number;
  total_all: number;
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
  parallel_plans: number;
  max_paused_plans: number;
  asset?: Asset;
  interval?: Interval;
  stats?: TaskStats;
};

export type CreatedMarketStatus = "PENDING" | "CREATED" | "FAILED" | "VERIFIED" | "RESOLVED";

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
  parallel_plans?: number;
  max_paused_plans?: number;
};

export type UpdateTaskRequest = {
  time_ahead_minutes?: number;
  is_create_active?: boolean;
  is_resolve_active?: boolean;
  parallel_plans?: number;
  max_paused_plans?: number;
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
  end_date?: string;
  icon?: string;
  // start_date, active, closed, archived, restricted, neg_risk,
  // neg_risk_market_id, comment_count, deployment_status and
  // deploying_timestamp are intentionally absent — they cannot be set at
  // event creation time.
  parent_event_id?: number;
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

export type ManualEventListItem = {
  id: number;
  created_at: string;
  event_external_id: string | null;
  event_slug: string;
  market_count: number;
  liveness: number | null;
};

export type ManualEventListResponse = {
  items: ManualEventListItem[];
  total: number;
  limit: number;
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

// DpmMarket mirrors apps/dpm-api/handlers/types.go MarketResponse 1:1. Every
// field the backend returns has a slot here so the backoffice UI never has
// to guess what's populated.
export type DpmMarket = {
  id: number;
  external_id: string;
  created_at: string;
  updated_at: string;
  event_id: number;

  question: string;
  condition_id?: string | null;
  slug?: string | null;
  resolution_source?: string | null;
  description?: string | null;

  active: boolean;
  closed: boolean;
  archived?: boolean | null;
  restricted?: boolean | null;

  start_date?: string | null;
  end_date?: string | null;
  seconds_delay?: string | null;

  question_id?: string | null;
  neg_risk?: boolean | null;
  neg_risk_market_id?: string | null;
  neg_risk_request_id?: string | null;
  neg_risk_other?: boolean | null;

  submitted_by?: string | null;
  resolved_by?: string | null;

  uma_bond?: string | null;
  uma_reward?: string | null;
  uma_resolution_status?: string | null;
  uma_resolution_statuses?: string[] | null;
  liveness?: string | null;

  paused?: boolean | null;
  flagged?: boolean | null;

  accepting_orders?: boolean | null;
  accepting_orders_timestamp?: string | null;
  public_accepting_orders?: boolean | null;
  public_accepting_orders_timestamp?: string | null;
  order_price_min_tick_size?: string | null;
  order_min_size?: number | null;

  funded?: boolean | null;
  approved?: boolean | null;
  activation?: string | null;
  automatically_active?: boolean | null;
  clear_book_on_start?: boolean | null;

  deployment_status: string;
  deploying_timestamp?: string | null;
  rfq_enabled?: boolean | null;

  // Optional fields the backend may add later (resolution_type isn't exposed
  // today — we infer from uma_* fields instead).
  resolution_type?: string | null;
  market_type?: string | null;

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

// MarketOutcomeResponse mirrors dpm-api's GET /markets/by-external-id/:id/outcome.
// `proposed` is null for CTF_Oracle markets (no propose step) and for UMA
// markets where no PROPOSE uma_request has been recorded yet. `tokens` is
// empty until the oracle reports a winner — each entry carries the outcome
// label (YES/NO/UP/DOWN/etc) and a tristate `winner` (null = unresolved).
export type ProposedAnswer = {
  // Raw 18-decimal fixed-point string, e.g. "1000000000000000000".
  proposed_price: string;
  // Server-derived label. The UI maps this to the correct outcome label.
  // "first_outcome_yes" | "second_outcome_yes" | "fifty_fifty" | "unknown".
  label: "first_outcome_yes" | "second_outcome_yes" | "fifty_fifty" | "unknown";
};

export type TokenOutcome = {
  outcome: string;
  winner: boolean | null;
};

export type MarketOutcome = {
  external_id: string;
  resolution_type: "UMA" | "CTF_ORACLE" | string;
  uma_resolution_status?: string | null;
  proposed?: ProposedAnswer | null;
  tokens: TokenOutcome[];
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

// ---------------------------------------------------------------------------
// Sports (mirrors apps/backoffice/handlers/sports_*.go).
// ---------------------------------------------------------------------------

export type SportTask = {
  id: number;
  created_at: string;
  updated_at: string;
  sport_key: string;
  api_league_id: number;
  api_season: number;
  league_slug: string;
  series_id: number;
  series_slug: string;
  time_ahead_hours: number;
  tag_ids: number[];
  category?: string;
  sub_category?: string;
  league_metadata?: Record<string, unknown>;
  is_create_active: boolean;
  is_resolve_active: boolean;
  is_metadata_update_active: boolean;
  auto_start_plans: boolean;
  /** Per-task UMA liveness override in seconds. Absent means the global default (7200s) applies. */
  liveness?: number;
  parallel_plans: number;
  max_paused_plans: number;
  market_types: SportMarketTypeSummary[];
  event_count: number;
};

export type SportMarketTypeSummary = {
  id: number;
  key: string;
  display_name: string;
  activated_at: string;
  deactivated_at?: string;
  link_id: number;
};

export type SportEvent = {
  id: number;
  api_fixture_id: number;
  sport_task_id: number;
  kickoff_at: string;
  event_external_id?: string;
  event_slug: string;
  fixture_status_short: string;
  fixture_payload?: Record<string, unknown>;
  is_skipped_by_operator: boolean;
  creation_plan_external_id?: string;
  backfill_plan_external_ids?: string[];
  last_polled_at?: string;
  last_metadata_pushed_at?: string;
  markets?: SportMarket[];
  decisions?: SportDecision[];
};

export type SportMarketStatus =
  | "pending"
  | "created"
  | "proposing"
  | "proposed"
  | "reset"
  | "disputed"
  | "resolving"
  | "resolved"
  | "refunded"
  | "cancelled"
  | "failed";

export type SportMarket = {
  id: number;
  sport_market_type_id: number;
  market_type_key: string;
  outcome_key: string;
  market_external_id?: string;
  deploy_plan_external_id?: string;
  deploy_plan_position?: number;
  market_slug: string;
  local_status: SportMarketStatus;
  propose_workflow_id?: string;
  resolve_workflow_id?: string;
  error?: string;
  created_at: string;
  updated_at: string;
};

export type SportResolutionMarket = {
  id: number;
  sport_event_id: number;
  market_external_id: string | null;
  market_slug: string;
  outcome_key: string;
  local_status: SportMarketStatus;
  updated_at: string;
};

export type SportResolutionList = {
  items: SportResolutionMarket[];
  total: number;
  offset: number;
  limit: number;
};

export type SportDecision = {
  id: number;
  sport_market_type_id: number;
  decision_kind: "propose" | "refund_5050";
  proposed_prices: Record<string, string>;
  decision_input_snapshot: Record<string, unknown>;
  decided_at: string;
  propose_dispatched_at?: string;
  resolve_dispatched_at?: string;
  correlation_id: string;
};

export type ApiFootballLeagueSearchResult = {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string;
  type: string;
};

// SportsTagSpec is the operator-facing slug+label pair the form sends.
// The backend upserts each via dpm-api, returning a numeric id that gets
// merged with any explicit tag_ids before being stored on the config.
export type SportsTagSpec = {
  slug: string;
  label?: string;
};

export type CreateSportTaskInput = {
  actor?: string;
  correlation_id?: string;
  sport_key: string;
  api_league_id: number;
  api_season: number;
  league_slug: string;
  time_ahead_hours: number;
  tag_ids?: number[];
  tag_specs?: SportsTagSpec[];
  category?: string;
  sub_category?: string;
  market_type_keys: string[];
  auto_start_plans?: boolean;
  /** UMA OO liveness in seconds. Omit to use the global default (7200s). */
  liveness?: number;
  parallel_plans?: number;
  max_paused_plans?: number;
};

export type UpdateSportTaskInput = {
  actor?: string;
  time_ahead_hours?: number;
  tag_ids?: number[];
  tag_specs?: SportsTagSpec[];
  category?: string;
  sub_category?: string;
  is_create_active?: boolean;
  is_resolve_active?: boolean;
  is_metadata_update_active?: boolean;
  auto_start_plans?: boolean;
  /** UMA OO liveness in seconds. Omit to leave unchanged. Set clear_liveness to revert to global default. */
  liveness?: number;
  /** When true, removes the per-task liveness override and reverts to the global default. */
  clear_liveness?: boolean;
  parallel_plans?: number;
  max_paused_plans?: number;
};

// ---------------------------------------------------------------------------
// Manual markets + events — mirrors the new manual_markets / manual_events
// backoffice DB tables and their API handlers.
// ---------------------------------------------------------------------------

export type ManualMarketLocalStatus =
  | "pending"
  | "created"
  | "proposing"
  | "proposed"
  | "reset"
  | "disputed"
  | "resolving"
  | "resolved"
  | "refunded"
  | "cancelled"
  | "failed";

export type ManualMarket = {
  id: number;
  manual_event_id: number;
  market_external_id?: string | null;
  deploy_plan_external_id?: string | null;
  deploy_plan_position?: number | null;
  market_slug: string;
  outcome_key: string;
  local_status: ManualMarketLocalStatus;
  propose_workflow_id?: string | null;
  resolve_workflow_id?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type ManualResolutionMarket = {
  id: number;
  manual_event_id: number;
  market_external_id: string | null;
  market_slug: string;
  outcome_key: string;
  local_status: ManualMarketLocalStatus;
  updated_at: string;
};

export type ManualResolutionList = {
  items: ManualResolutionMarket[];
  total: number;
  offset: number;
  limit: number;
};

export type ManualEvent = {
  id: number;
  event_external_id?: string | null;
  event_slug: string;
  is_skipped_by_operator: boolean;
  creation_plan_external_id?: string | null;
  backfill_plan_external_ids?: string[];
  error?: string | null;
  created_at: string;
  updated_at: string;
  manual_markets?: ManualMarket[];
};

// ---------------------------------------------------------------------------
// Crypto-interval refactor — mirrors apps/backoffice/handlers/crypto_*.go.
// Legacy `Task`/`Asset`/`Interval` types stay in this file for backward-compat
// with any existing dashboard imports; the new types below are the post-
// refactor shape (renamed tables + per-slot `crypto_events` + `crypto_markets`
// + `crypto_decisions` outbox, all driven through DeployPlan).
// ---------------------------------------------------------------------------

export type CryptoEventMarketStatus =
  | "pending"
  | "created"
  | "verified"
  | "resolving"
  | "resolved"
  | "cancelled"
  | "failed";

export type CryptoMarket = {
  id: number;
  market_external_id?: string;
  deploy_plan_external_id?: string;
  deploy_plan_position?: number;
  market_slug: string;
  local_status: CryptoEventMarketStatus;
  verified_at?: string;
  resolve_dispatched_at?: string;
  error?: string;
  created_at: string;
  updated_at: string;
};

export type CryptoDecision = {
  id: number;
  outcome: "up" | "down";
  payouts: string[];
  decision_input_snapshot: Record<string, unknown>;
  decided_at: string;
  dispatched_at?: string;
  correlation_id: string;
};

export type CryptoEvent = {
  id: number;
  crypto_task_id: number;
  slot_start: string;
  slot_end: string;
  event_external_id?: string;
  event_slug: string;
  price_to_beat?: string;
  price_at_close?: string;
  deploy_plan_external_id?: string;
  is_skipped_by_operator: boolean;
  error?: string;
  created_at: string;
  updated_at: string;
  markets?: CryptoMarket[];
  decision?: CryptoDecision;
};
