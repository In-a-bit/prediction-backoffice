import Link from "next/link";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { DeployPlanDriver } from "@/components/manual/deploy-plan-driver";
import { manual } from "@/lib/api";
import { formatDateTimeFull } from "@/lib/format";
import type { DeployPlan, DeployPlanStatus, OperatorLogEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// classifySource mirrors the same logic from the list page so the badge
// stays consistent between list and detail views.
function classifySource(plan: DeployPlan): "manual" | "sports" {
  if (plan.actor === "sports-auto") return "sports";
  if (plan.note && plan.note.toLowerCase().startsWith("sports/")) return "sports";
  return "manual";
}

export default async function DeployPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let plan: DeployPlan | null = null;
  let error: string | null = null;
  let logs: OperatorLogEntry[] = [];

  try {
    plan = await manual.getDeployPlan(id);
    if (plan.correlation_id) {
      try {
        logs = await manual.listOperatorLog({
          correlation_id: plan.correlation_id,
          limit: 200,
        });
      } catch {
        // Soft-fail on logs — the plan view is still useful without them.
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error || !plan) {
    return (
      <div className="px-6 py-8 max-w-4xl mx-auto space-y-4">
        <PageHeader
          title="Deploy plan"
          actions={
            <Link href="/deploy-plans" className={buttonVariants.ghost}>
              ← All plans
            </Link>
          }
        />
        <ErrorMessage>{error ?? "Plan not found"}</ErrorMessage>
      </div>
    );
  }

  const source = classifySource(plan);
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={plan.note ?? "Deploy plan"}
        description="Live view of a backend-driven market deploy queue. Closing this tab will not stop execution — the runner continues server-side."
        actions={
          <Link
            href={`/deploy-plans?source=${source}`}
            className={buttonVariants.ghost}
          >
            ← All {source} plans
          </Link>
        }
      />

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlanStatusBadge status={plan.status} />
            <Badge tone={source === "sports" ? "info" : "neutral"}>{source}</Badge>
            <span className="text-xs text-foreground-muted">by {plan.actor}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-[11px] text-foreground-muted">
            <span>created {formatDateTimeFull(plan.created_at)}</span>
            <span>updated {formatDateTimeFull(plan.updated_at)}</span>
          </div>
        </CardHeader>
        <CardBody className="text-xs space-y-1.5 font-mono break-all">
          <div>
            <span className="text-foreground-muted">plan: </span>
            {plan.external_id}
          </div>
          <div>
            <span className="text-foreground-muted">event: </span>
            <Link
              href={`/automations/manual/events/${encodeURIComponent(plan.event_external_id)}/markets/new`}
              className="underline"
            >
              {plan.event_external_id}
            </Link>
          </div>
          {plan.correlation_id ? (
            <div>
              <span className="text-foreground-muted">correlation: </span>
              <Link
                href={`/operator-log?correlation_id=${plan.correlation_id}`}
                className="underline"
              >
                {plan.correlation_id}
              </Link>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <DeployPlanDriver planExternalId={plan.external_id} />

      {logs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
            Operator log entries{" "}
            <span className="font-normal normal-case text-foreground-muted">
              · grouped by correlation
            </span>
          </h2>
          <ul className="space-y-2">
            {logs.map((e) => (
              <LogRow key={e.id} entry={e} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PlanStatusBadge({ status }: { status: DeployPlanStatus }) {
  switch (status) {
    case "pending":
      return <Badge tone="neutral">pending</Badge>;
    case "running":
      return <Badge tone="info">running</Badge>;
    case "paused":
      return <Badge tone="warning">paused</Badge>;
    case "completed":
      return <Badge tone="success">completed</Badge>;
    case "failed":
      return <Badge tone="danger">failed</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

function LogRow({ entry }: { entry: OperatorLogEntry }) {
  const tone =
    entry.status === "succeeded"
      ? "success"
      : entry.status === "failed"
        ? "danger"
        : entry.status === "waiting_for_balance"
          ? "warning"
          : entry.status === "running" || entry.status === "submitted"
            ? "info"
            : "neutral";
  return (
    <li>
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge tone={tone}>{entry.status}</Badge>
            <span className="text-sm font-medium">{entry.action}</span>
            <span className="text-xs text-foreground-muted">· {entry.resource_type}</span>
            {entry.resource_external_id ? (
              <span className="text-[11px] text-foreground-muted font-mono truncate">
                · {entry.resource_external_id}
              </span>
            ) : null}
          </div>
          <span className="text-[11px] text-foreground-muted shrink-0">
            {formatDateTimeFull(entry.created_at)}
          </span>
        </CardHeader>
        {entry.error ? (
          <CardBody className="text-xs text-danger">{entry.error}</CardBody>
        ) : null}
      </Card>
    </li>
  );
}
