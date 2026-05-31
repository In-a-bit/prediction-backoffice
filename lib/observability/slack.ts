import "server-only";

import { severityOrder } from "./memory-store";
import type { OperatorAlert } from "./types";

// Best-effort Slack/Discord webhook fan-out. Only severity >= warning is
// forwarded so the channel doesn't drown in info-level noise. Failures are
// swallowed: a recordAlert call must never fail because the webhook is down.

const webhookUrl = process.env.OPS_SLACK_WEBHOOK_URL;
const minSeverity = severityOrder.warning;

export async function reportToSlack(alert: OperatorAlert): Promise<void> {
  if (!webhookUrl) return;
  if (severityOrder[alert.severity] < minSeverity) return;
  try {
    const text = formatSlackMessage(alert);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      // Don't keep the request alive past a few seconds — alerts are best-
      // effort, and a hung webhook should never block a server render.
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    // Best-effort. Log to console so the failure is at least visible.
    console.warn("[observability] slack webhook failed", err);
  }
}

function formatSlackMessage(alert: OperatorAlert): string {
  const head = `[${alert.severity.toUpperCase()}] ${alert.source}/${alert.action ?? "unknown"}`;
  const lines = [head, alert.message];
  if (alert.resource_external_id) {
    const t = alert.resource_type ? `${alert.resource_type} ` : "";
    lines.push(`${t}${alert.resource_external_id}`);
  }
  if (alert.correlation_id) lines.push(`correlation_id: ${alert.correlation_id}`);
  return lines.join("\n");
}
