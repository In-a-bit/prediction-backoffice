import "server-only";

import type {
  AlertCounts,
  AlertFilters,
  AlertSeverity,
  AlertSource,
  OperatorAlert,
} from "./types";

// In-process ring buffer used as the fallback when the prediction-bundler
// /operations/alerts endpoint is unreachable (e.g. before the backend PR
// merges, or during a transient outage). Pure side-effect-free reads, so the
// upstream HTTP store can layer on top without coordination.
//
// The buffer is a single global so every server-rendered page in this Node
// process sees the same alerts. In a multi-instance deployment each instance
// keeps its own buffer until the Postgres store takes over — that's the
// trade-off we accept for "works without backend support".

const MAX_ENTRIES = 500;

declare global {
  // Hot reload in dev replaces module-scoped values, so we hang the ring
  // off `globalThis` to survive HMR. Without this, every save would clear
  // the operator's alert history.
  // eslint-disable-next-line no-var
  var __opAlertsBuffer: OperatorAlert[] | undefined;
}

function buffer(): OperatorAlert[] {
  if (!globalThis.__opAlertsBuffer) globalThis.__opAlertsBuffer = [];
  return globalThis.__opAlertsBuffer;
}

export function memoryAppend(alert: OperatorAlert): void {
  const buf = buffer();
  buf.unshift(alert);
  if (buf.length > MAX_ENTRIES) buf.length = MAX_ENTRIES;
}

export function memoryAck(externalId: string, actor: string): OperatorAlert | undefined {
  const buf = buffer();
  const found = buf.find((a) => a.external_id === externalId);
  if (!found) return undefined;
  found.acknowledged_at = new Date().toISOString();
  found.acknowledged_by = actor;
  return found;
}

export function memoryList(filters: AlertFilters = {}): OperatorAlert[] {
  let rows = buffer().slice();
  if (filters.since) {
    const cutoff = new Date(filters.since).getTime();
    rows = rows.filter((a) => new Date(a.created_at).getTime() >= cutoff);
  }
  if (filters.severity) {
    const severities = Array.isArray(filters.severity)
      ? new Set(filters.severity)
      : new Set([filters.severity]);
    rows = rows.filter((a) => severities.has(a.severity));
  }
  if (filters.source) {
    const sources = Array.isArray(filters.source)
      ? new Set(filters.source)
      : new Set([filters.source]);
    rows = rows.filter((a) => sources.has(a.source));
  }
  if (filters.resource_type) {
    const entities = Array.isArray(filters.resource_type)
      ? new Set(filters.resource_type)
      : new Set([filters.resource_type]);
    rows = rows.filter((a) => entities.has(a.resource_type));
  }
  if (filters.action) {
    const action = filters.action.toLowerCase();
    rows = rows.filter((a) => (a.action ?? "").toLowerCase().includes(action));
  }
  if (filters.acknowledged !== undefined) {
    rows = filters.acknowledged
      ? rows.filter((a) => !!a.acknowledged_at)
      : rows.filter((a) => !a.acknowledged_at);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter(
      (a) =>
        a.message.toLowerCase().includes(q) ||
        (a.stack ?? "").toLowerCase().includes(q),
    );
  }
  if (filters.limit) rows = rows.slice(0, filters.limit);
  return rows;
}

export function memoryCounts(filters: AlertFilters = {}): AlertCounts {
  const rows = memoryList({ ...filters, limit: undefined });
  const counts: AlertCounts = {
    total: rows.length,
    unacknowledged: rows.filter((a) => !a.acknowledged_at).length,
    by_severity: { error: 0, warning: 0, info: 0 },
    by_source: {},
  };
  for (const row of rows) {
    counts.by_severity[row.severity] = (counts.by_severity[row.severity] ?? 0) + 1;
    const src: AlertSource = row.source;
    counts.by_source[src] = (counts.by_source[src] ?? 0) + 1;
  }
  return counts;
}

// Severity ranking for filtering severity >= warning, used by Slack fan-out.
export const severityOrder: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
};
