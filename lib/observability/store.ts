import "server-only";

import { alerts as alertsApi, BackofficeApiError } from "@/lib/api";
import {
  memoryAck,
  memoryAppend,
  memoryCounts,
  memoryList,
} from "./memory-store";
import { reportToSentry } from "./sentry";
import { reportToSlack } from "./slack";
import type {
  AlertCounts,
  AlertFilters,
  OperatorAlert,
} from "./types";

// store.ts is the single import-point for the rest of the app. It tries the
// future Postgres-backed Go endpoints (see plan §Phase 1) first, and
// transparently falls back to the in-memory store when those endpoints are
// unreachable. The same code path keeps working before and after the Go API
// PR lands; the only observable difference is whether alerts survive a
// Next.js redeploy.

// Treat any HTTP failure (404 today, 5xx tomorrow) as "remote unavailable";
// the in-memory ring takes over. We only return false when the path
// genuinely succeeded so a one-off backend hiccup doesn't permanently
// disable the remote store.
function shouldFallBack(err: unknown): boolean {
  if (err instanceof BackofficeApiError) {
    // 404 = endpoint not implemented yet. 5xx / network = transient.
    return err.status === 404 || err.status >= 500 || err.status === 0;
  }
  // TypeError from fetch (network down), AbortError, etc.
  return true;
}

export async function persistAlert(alert: OperatorAlert): Promise<OperatorAlert> {
  // Always mirror to memory so reads degrade gracefully even if the remote
  // call later fails. The remote write is then the source-of-truth: if it
  // succeeds we keep using the remote shape; if it fails, the memory copy
  // remains.
  memoryAppend(alert);

  try {
    const remote = await alertsApi.record(alert);
    // The remote write may normalise fields (e.g. server-side created_at).
    // Reflect those into the memory copy so subsequent reads agree.
    Object.assign(alert, remote);
  } catch (err) {
    if (!shouldFallBack(err)) throw err;
    // Remote unavailable — memory copy is the canonical record for now.
  }

  // Side-channel fan-out. Slack only forwards warning+, Sentry mirrors
  // everything when configured.
  await Promise.allSettled([reportToSlack(alert), Promise.resolve(reportToSentry(alert))]);

  return alert;
}

export async function listAlerts(filters: AlertFilters = {}): Promise<OperatorAlert[]> {
  try {
    return await alertsApi.list(filters);
  } catch (err) {
    if (!shouldFallBack(err)) throw err;
    return memoryList(filters);
  }
}

export async function countAlerts(filters: AlertFilters = {}): Promise<AlertCounts> {
  try {
    return await alertsApi.counts(filters);
  } catch (err) {
    if (!shouldFallBack(err)) throw err;
    return memoryCounts(filters);
  }
}

export async function acknowledgeAlert(
  externalId: string,
  actor: string,
): Promise<OperatorAlert | undefined> {
  try {
    return await alertsApi.acknowledge(externalId, actor);
  } catch (err) {
    if (!shouldFallBack(err)) throw err;
    return memoryAck(externalId, actor);
  }
}
