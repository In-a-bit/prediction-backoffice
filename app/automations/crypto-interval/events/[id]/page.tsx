import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, Card, CardBody, CardHeader, PageHeader, buttonVariants } from "@/components/ui";
import { DeployPlanDriver } from "@/components/manual/deploy-plan-driver";
import { crypto as cryptoApi } from "@/lib/api";
import { formatDateTimeFull } from "@/lib/format";
import { EventActions } from "./actions";
import { EventAutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

export default async function CryptoEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const event = await cryptoApi.getCryptoEvent(id).catch(() => null);
  if (!event) notFound();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <EventAutoRefresh
        deployPlanId={event.deploy_plan_external_id}
        intervalMs={2000}
      />
      <PageHeader
        title={event.event_slug}
        description={`Slot ${formatDateTimeFull(event.slot_start)} → ${formatDateTimeFull(event.slot_end)} · crypto_task ${event.crypto_task_id}`}
      />

      <EventActions
        eventId={event.id}
        hasDeployPlan={Boolean(event.deploy_plan_external_id)}
        isSkipped={event.is_skipped_by_operator}
      />

      {/* Creation plan — reuse <DeployPlanDriver/> verbatim. */}
      {event.deploy_plan_external_id ? (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Creation plan</h2>
          <DeployPlanDriver planExternalId={event.deploy_plan_external_id} />
        </div>
      ) : (
        <Card className="mt-8">
          <CardBody className="text-sm text-foreground-muted">
            No deploy plan yet. Click <em>Force create now</em> above (or wait for the next
            crypto-creator tick) to spawn one.
          </CardBody>
        </Card>
      )}

      {/* Prices (set by the price-ticker stages A + B). */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <span className="font-semibold text-sm">Price to beat (open)</span>
          </CardHeader>
          <CardBody className="text-sm font-mono break-all">
            {event.price_to_beat ?? <span className="text-foreground-muted">pending — Stage A stamps this mid-slot</span>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <span className="font-semibold text-sm">Price at close</span>
          </CardHeader>
          <CardBody className="text-sm font-mono break-all">
            {event.price_at_close ?? <span className="text-foreground-muted">pending — Stage B stamps this after slot_end</span>}
          </CardBody>
        </Card>
      </div>

      {/* Markets table — one row for CTF binary. */}
      {event.markets && event.markets.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Markets</h2>
          <div className="border rounded overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="text-left px-3 py-2">Slug</th>
                  <th className="text-left px-3 py-2">Local status</th>
                  <th className="text-left px-3 py-2">Market UUID</th>
                  <th className="text-left px-3 py-2">Verified at</th>
                </tr>
              </thead>
              <tbody>
                {event.markets.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{m.market_slug}</td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(m.local_status)}>{m.local_status}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {m.market_external_id ? shortId(m.market_external_id) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {m.verified_at ? formatDateTimeFull(m.verified_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision (set by Stage B). */}
      {event.decision && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Resolution decision</h2>
          <Card>
            <CardHeader className="flex items-center gap-3">
              <Badge tone={event.decision.outcome === "up" ? "success" : "info"}>
                {event.decision.outcome.toUpperCase()}
              </Badge>
              {event.decision.dispatched_at ? (
                <Badge tone="success">dispatched</Badge>
              ) : (
                <Badge tone="neutral">pending dispatch</Badge>
              )}
              <span className="ml-auto text-xs text-foreground-muted">
                decided at {formatDateTimeFull(event.decision.decided_at)}
              </span>
            </CardHeader>
            <CardBody className="text-xs text-foreground-muted space-y-2">
              <div className="font-mono">
                Payouts: [{event.decision.payouts.map(truncatePayout).join(", ")}]
              </div>
              <details>
                <summary className="cursor-pointer">Decision input snapshot</summary>
                <pre className="mt-2 p-2 bg-surface-2 rounded text-[10px] overflow-x-auto">
                  {JSON.stringify(event.decision.decision_input_snapshot, null, 2)}
                </pre>
              </details>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="mt-10">
        <Link href="/automations/crypto-interval" className={buttonVariants.ghost}>
          ← Back to crypto tasks
        </Link>
      </div>
    </div>
  );
}

function statusTone(s: string): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (s) {
    case "resolved":
      return "success";
    case "verified":
    case "resolving":
    case "created":
      return "info";
    case "pending":
      return "neutral";
    case "cancelled":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function shortId(id: string): string {
  return id.split("-")[0] ?? id.slice(0, 8);
}

function truncatePayout(p: string): string {
  if (p === "1000000000000000000") return "YES";
  if (p === "0") return "NO";
  return p;
}
