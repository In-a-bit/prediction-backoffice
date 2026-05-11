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
