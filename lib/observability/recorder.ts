import "server-only";

import { persistAlert } from "./store";
import type { OperatorAlert, RecordAlertInput } from "./types";

// Web Crypto's randomUUID is available in both the Node and Edge runtimes,
// so the recorder can be reached from instrumentation.ts (which Next.js
// loads under both runtimes) without a runtime-specific import.
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback so older Node versions still get a unique-ish id. We never
  // expect to hit this branch — Node 19+ has crypto.randomUUID.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// recordAlert + withAlerts are the two call sites the rest of the app uses.
// Anything thrown out of a route handler / server action / server component
// should flow through one of these so the operator alerts feed stays in
// sync with the operator's reality.

export async function recordAlert(input: RecordAlertInput): Promise<OperatorAlert> {
  const alert: OperatorAlert = {
    external_id: newId(),
    created_at: new Date().toISOString(),
    severity: input.severity,
    source: input.source,
    action: input.action,
    message: input.message,
    stack: extractStack(input.error),
    correlation_id: input.correlation_id,
    request_payload: input.request_payload,
    resource_type: input.resource_type,
    resource_external_id: input.resource_external_id,
  };
  try {
    return await persistAlert(alert);
  } catch (err) {
    // Hard-failsafe: an alert pipeline that throws is worse than no pipeline
    // at all because it cascades into the calling code. Log + swallow.
    console.error("[observability] recordAlert failed", err, alert);
    return alert;
  }
}

// withAlerts wraps an async function. On throw it records an alert and then
// re-throws so the upstream control flow is unchanged. Success is a no-op.
export async function withAlerts<T>(
  meta: Omit<RecordAlertInput, "message" | "error" | "severity"> & {
    severity?: RecordAlertInput["severity"];
  },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await recordAlert({
      severity: meta.severity ?? "error",
      source: meta.source,
      action: meta.action,
      correlation_id: meta.correlation_id,
      request_payload: meta.request_payload,
      resource_type: meta.resource_type,
      resource_external_id: meta.resource_external_id,
      message: messageFor(err),
      error: err,
    });
    throw err;
  }
}

function extractStack(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) return err.stack;
  return undefined;
}

function messageFor(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "unknown error";
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
