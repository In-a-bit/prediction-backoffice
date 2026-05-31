import "server-only";

import type { OperatorAlert } from "./types";

// Sentry adapter — opt-in. Engineers can drop in @sentry/nextjs and an
// SENTRY_DSN env var; until they do, this file is a no-op so the rest of
// the observability stack works without the dependency.
//
// We deliberately don't import @sentry/nextjs at module load because the
// package is only added when the team decides to enable it. Lazy require
// behind a runtime guard keeps build/runtime clean otherwise.

type SentryClient = {
  captureException?: (e: unknown, ctx?: Record<string, unknown>) => unknown;
  captureMessage?: (msg: string, ctx?: Record<string, unknown>) => unknown;
};

let cached: SentryClient | null | undefined;

function load(): SentryClient | null {
  if (cached !== undefined) return cached;
  if (!process.env.SENTRY_DSN) {
    cached = null;
    return cached;
  }
  try {
    // Resolved at runtime if the package is installed. The eval keeps
    // bundlers from trying to follow the import statically.
    const mod: SentryClient = (globalThis as unknown as { Sentry?: SentryClient }).Sentry ?? {};
    cached = mod;
    return cached;
  } catch {
    cached = null;
    return cached;
  }
}

export function reportToSentry(alert: OperatorAlert): void {
  const client = load();
  if (!client) return;
  const ctx = {
    tags: { source: alert.source, action: alert.action ?? "unknown" },
    extra: {
      correlation_id: alert.correlation_id,
      resource_type: alert.resource_type,
      resource_external_id: alert.resource_external_id,
      stack: alert.stack,
    },
  };
  if (alert.severity === "error" && client.captureException) {
    client.captureException(new Error(alert.message), ctx);
  } else if (client.captureMessage) {
    client.captureMessage(alert.message, ctx);
  }
}
