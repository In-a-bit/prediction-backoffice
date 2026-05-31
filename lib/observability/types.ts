// Shared types for the operator-alerts pipeline. The schema mirrors the
// future operator_alerts Postgres table planned for prediction-bundler;
// everything here is sized so a single row maps 1:1 onto a SQL row.

export type AlertSeverity = "error" | "warning" | "info";

export type AlertSource =
  | "manual"
  | "crypto"
  | "sport"
  | "dpm"
  | "ui"
  | "system";

export type AlertEntity =
  | "market"
  | "event"
  | "series"
  | "task"
  | "deploy_plan"
  | "operator_log"
  | undefined;

// OperatorAlert is the read shape returned by GET /operations/alerts (or the
// in-memory fallback). external_id is a uuid v4 generated client-side so
// retries/idempotency work even if the network blip duplicates a write.
export type OperatorAlert = {
  external_id: string;
  created_at: string;
  severity: AlertSeverity;
  source: AlertSource;
  // The verb that produced the alert (create_event, uma_propose, ui_render, ...).
  action?: string;
  message: string;
  stack?: string;
  // Cross-references back to the originating audit chain.
  correlation_id?: string;
  request_payload?: unknown;
  // Resource the alert is *about* (so operators can filter by entity).
  resource_type?: AlertEntity;
  resource_external_id?: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
};

// Input shape for recordAlert / withAlerts. Caller supplies the metadata;
// the recorder fills in external_id + created_at + serialises the stack.
export type RecordAlertInput = {
  severity: AlertSeverity;
  source: AlertSource;
  action?: string;
  message: string;
  // If supplied, .stack is captured. Most call sites pass an Error.
  error?: unknown;
  correlation_id?: string;
  request_payload?: unknown;
  resource_type?: AlertEntity;
  resource_external_id?: string;
};

// Filters honoured by listAlerts. Mirrors the planned ?severity=&source=…
// query string on the Go endpoint.
export type AlertFilters = {
  severity?: AlertSeverity | AlertSeverity[];
  source?: AlertSource | AlertSource[];
  resource_type?: AlertEntity | AlertEntity[];
  action?: string;
  acknowledged?: boolean;
  // Free-text search over message + stack.
  q?: string;
  // ISO-8601 lower bound on created_at.
  since?: string;
  limit?: number;
};

export type AlertCounts = {
  total: number;
  unacknowledged: number;
  by_severity: Record<AlertSeverity, number>;
  by_source: Partial<Record<AlertSource, number>>;
};
