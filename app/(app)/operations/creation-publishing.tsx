import Link from "next/link";

import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { DeployPlan, OperatorLogEntry } from "@/lib/types";

import { classifyPlans, timeAgo } from "./_helpers";

// CreationAndPublishingTab renders three columns — Manual, Crypto, Sport —
// with the most-recent creation activity per source. Manual reads from the
// operator_log; Crypto / Sport read from deploy plans tagged by the
// auto-creator actors. Tables stay short (10 rows) so the dashboard remains
// scannable; deeper history lives on /operator-log + /deploy-plans.

const ROW_LIMIT = 10;

export function CreationAndPublishingTab({
  plans,
  log,
}: {
  plans: DeployPlan[];
  log: OperatorLogEntry[];
}) {
  const bySource = classifyPlans(plans);
  const manualLog = log
    .filter(
      (entry) =>
        entry.actor !== "crypto-auto" &&
        entry.actor !== "sports-auto" &&
        (entry.action === "create_event" ||
          entry.action === "create_market" ||
          entry.action === "create_series" ||
          entry.action === "create_event_from_slug" ||
          entry.action === "create_event_from_description"),
    )
    .slice(0, ROW_LIMIT);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <ManualSourceCard entries={manualLog} />
      <PlanSourceCard
        title="Crypto"
        plans={bySource.crypto.slice(0, ROW_LIMIT)}
        emptyHint="No crypto plans in the last hour."
      />
      <PlanSourceCard
        title="Sport"
        plans={bySource.sport.slice(0, ROW_LIMIT)}
        emptyHint="No sport plans in the last hour."
      />
    </div>
  );
}

function ManualSourceCard({ entries }: { entries: OperatorLogEntry[] }) {
  const failed = entries.filter((e) => e.status === "failed").length;
  const pending = entries.filter(
    (e) => e.status === "running" || e.status === "submitted" || e.status === "waiting_for_balance",
  ).length;
  const succeeded = entries.filter((e) => e.status === "succeeded").length;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">Manual</span>
          <SummaryBadge succeeded={succeeded} pending={pending} failed={failed} />
        </div>
      </CardHeader>
      <CardBody className="!p-0">
        {entries.length === 0 ? (
          <EmptyState
            title="No manual activity"
            description="Recent create_event / create_market / create_series rows will land here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-foreground-muted">
                <tr className="border-b border-border">
                  <Th>Created</Th>
                  <Th>Action</Th>
                  <Th>Resource</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border last:border-0 hover:bg-foreground/[0.025] transition-colors"
                  >
                    <Td className="text-foreground-muted whitespace-nowrap">
                      {timeAgo(entry.created_at)}
                    </Td>
                    <Td className="font-mono text-xs">
                      {prettyAction(entry.action)}
                    </Td>
                    <Td>
                      <Link
                        href={resourceHref(entry)}
                        className="text-accent hover:underline truncate max-w-[12rem] inline-block align-middle"
                        title={entry.resource_external_id}
                      >
                        {entry.resource_external_id?.slice(0, 8) ?? "—"}
                      </Link>{" "}
                      <span className="text-foreground-muted">
                        ({entry.resource_type})
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={entry.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function PlanSourceCard({
  title,
  plans,
  emptyHint,
}: {
  title: string;
  plans: DeployPlan[];
  emptyHint: string;
}) {
  const failed = plans.filter((p) => p.status === "failed").length;
  const pending = plans.filter(
    (p) => p.status === "pending" || p.status === "running",
  ).length;
  const succeeded = plans.filter((p) => p.status === "completed").length;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          <SummaryBadge succeeded={succeeded} pending={pending} failed={failed} />
        </div>
      </CardHeader>
      <CardBody className="!p-0">
        {plans.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} activity`} description={emptyHint} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-foreground-muted">
                <tr className="border-b border-border">
                  <Th>Created</Th>
                  <Th>Plan</Th>
                  <Th>Markets</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan.external_id}
                    className="border-b border-border last:border-0 hover:bg-foreground/[0.025] transition-colors"
                  >
                    <Td className="text-foreground-muted whitespace-nowrap">
                      {timeAgo(plan.created_at)}
                    </Td>
                    <Td>
                      <Link
                        href={`/deploy-plans/${plan.external_id}?from=operations`}
                        className="text-accent hover:underline truncate max-w-[14rem] inline-block align-middle"
                        title={plan.note ?? plan.external_id}
                      >
                        {plan.note ?? plan.external_id.slice(0, 8)}
                      </Link>
                    </Td>
                    <Td>
                      <PlanMarketsBreakdown plan={plan} />
                    </Td>
                    <Td>
                      <PlanStatusBadge status={plan.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SummaryBadge({
  succeeded,
  pending,
  failed,
}: {
  succeeded: number;
  pending: number;
  failed: number;
}) {
  if (failed > 0)
    return <Badge tone="danger">{failed} failed</Badge>;
  if (pending > 0)
    return <Badge tone="warning">{pending} pending</Badge>;
  return <Badge tone="success">{succeeded} ok</Badge>;
}

function StatusBadge({ status }: { status: OperatorLogEntry["status"] }) {
  const tone =
    status === "failed"
      ? "danger"
      : status === "succeeded"
        ? "success"
        : status === "skipped"
          ? "neutral"
          : "info";
  return <Badge tone={tone}>{status}</Badge>;
}

function PlanStatusBadge({ status }: { status: DeployPlan["status"] }) {
  const tone =
    status === "failed"
      ? "danger"
      : status === "completed"
        ? "success"
        : status === "paused"
          ? "warning"
          : "info";
  return <Badge tone={tone}>{status}</Badge>;
}

function PlanMarketsBreakdown({ plan }: { plan: DeployPlan }) {
  const total = plan.markets.length;
  const deployed = plan.markets.filter((m) => m.status === "deployed").length;
  const failed = plan.markets.filter((m) => m.status === "failed").length;
  return (
    <span className="tabular-nums text-xs">
      <span className="text-success">{deployed}</span>
      <span className="text-foreground-muted">/</span>
      <span>{total}</span>
      {failed > 0 ? (
        <span className="ml-2 text-danger">· {failed} failed</span>
      ) : null}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="text-left font-medium text-[11px] uppercase tracking-wider px-4 py-2.5 whitespace-nowrap"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}

function prettyAction(action: OperatorLogEntry["action"]): string {
  return action.replaceAll("_", " ");
}

function resourceHref(entry: OperatorLogEntry): string {
  const id = entry.resource_external_id;
  if (!id) return "/operator-log";
  switch (entry.resource_type) {
    case "market":
      return `/markets/${encodeURIComponent(id)}?from=operations`;
    case "event":
      return `/events?from=operations`;
    default:
      return `/operator-log?from=operations`;
  }
}

