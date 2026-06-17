import { AutoRefresh } from "@/components/auto-refresh";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Stat,
  Tabs,
} from "@/components/ui";
import { crypto, manual, sports } from "@/lib/api";
import { countAlerts } from "@/lib/observability/store";
import type {
  DeployPlan,
  OperatorLogEntry,
  SportTask,
  Task,
  TaskStats,
} from "@/lib/types";

import { CreationAndPublishingTab } from "./creation-publishing";
import { unwrap, stringifyError } from "./_helpers";
import { LiveTab } from "./live";

export const dynamic = "force-dynamic";

type View = "publishing" | "live";

function isView(v: unknown): v is View {
  return v === "publishing" || v === "live";
}

// Cross-source operations dashboard. The shape matches the operations-a v2
// canvas: KPI strip up top, two URL-driven tabs (Creation & Publishing, Live)
// below. Data fans out across crypto/sport/manual concurrently and renders
// once everything settles.

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view: View = isView(sp.view) ? sp.view : "publishing";

  const [
    cryptoTasksResult,
    sportTasksResult,
    plansResult,
    logResult,
    alertCountsResult,
  ] = await Promise.allSettled([
    crypto.listTasks({ withStats: true }),
    sports.listTasks(),
    manual.listDeployPlans({ limit: 60 }),
    manual.listOperatorLog({ limit: 60 }),
    countAlerts({ acknowledged: false }),
  ]);

  const cryptoTasks = (unwrap(cryptoTasksResult, { data: [] as Task[], total: 0, limit: 60, offset: 0 })).data;
  const sportTasks = unwrap(sportTasksResult, [] as SportTask[]);
  const plans = (unwrap(plansResult, { data: [] as DeployPlan[], total: 0, limit: 60, offset: 0 })).data;
  const log = (unwrap(logResult, { data: [] as OperatorLogEntry[], total: 0, limit: 60, offset: 0 })).data;
  const alertCounts = unwrap(alertCountsResult, {
    total: 0,
    unacknowledged: 0,
    by_severity: { error: 0, warning: 0, info: 0 },
    by_source: {},
  });

  const apiErrors = [
    cryptoTasksResult,
    sportTasksResult,
    plansResult,
    logResult,
  ]
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => stringifyError(r.reason));

  const totals = aggregate(cryptoTasks, sportTasks, plans);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Live overview across every automation behavior. Auto-refreshes every 15s."
        actions={<AutoRefresh />}
      />

      {apiErrors.length ? (
        <ErrorMessage>
          Some sources failed to load: {apiErrors.join(" · ")}
        </ErrorMessage>
      ) : null}

      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            <Stat
              label="Active tasks"
              value={`${totals.activeTasks}/${totals.totalTasks}`}
              hint="create or resolve enabled"
            />
            <Stat
              label="Created (24h)"
              value={totals.created24}
              tone="success"
            />
            <Stat
              label="Verifying"
              value={totals.awaitingVerify}
              tone={totals.awaitingVerify > 0 ? "info" : "neutral"}
              hint="awaiting on-chain confirmation"
            />
            <Stat
              label="Failed (24h)"
              value={totals.failed24}
              tone={totals.failed24 > 0 ? "danger" : "neutral"}
            />
            <Stat
              label="In-flight plans"
              value={totals.runningPlans}
              tone={totals.runningPlans > 0 ? "info" : "neutral"}
              hint="pending or running"
            />
            <Stat
              label="Open alerts"
              value={alertCounts.unacknowledged}
              tone={
                alertCounts.by_severity.error > 0
                  ? "danger"
                  : alertCounts.unacknowledged > 0
                    ? "warning"
                    : "neutral"
              }
              hint={
                alertCounts.by_severity.error > 0
                  ? `${alertCounts.by_severity.error} error · view`
                  : "view alerts"
              }
            />
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs<View>
          tabs={[
            {
              key: "publishing",
              label: "Creation & Publishing",
              href: "/operations?view=publishing",
            },
            {
              key: "live",
              label: "Live",
              href: "/operations?view=live",
            },
          ]}
          current={view}
          label="Operations view"
        />
        <a
          href="/operations/alerts"
          className="text-xs text-foreground-muted hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <Badge tone={alertCounts.by_severity.error > 0 ? "danger" : "neutral"}>
            {alertCounts.unacknowledged} open
          </Badge>
          View alert feed →
        </a>
      </div>

      {view === "publishing" ? (
        <CreationAndPublishingTab plans={plans} log={log} />
      ) : (
        <LiveTab plans={plans} cryptoTasks={cryptoTasks} sportTasks={sportTasks} />
      )}

      {plans.length === 0 && cryptoTasks.length === 0 && sportTasks.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to operate yet"
            description="Configure a behavior to see live activity here."
          />
        </Card>
      ) : null}
    </div>
  );
}

function aggregate(
  cryptoTasks: Task[],
  sportTasks: SportTask[],
  plans: DeployPlan[],
) {
  const sum = (k: keyof TaskStats) =>
    cryptoTasks.reduce((acc, t) => acc + ((t.stats?.[k] as number) ?? 0), 0);
  const activeCrypto = cryptoTasks.filter(
    (t) => t.is_create_active || t.is_resolve_active,
  ).length;
  const activeSport = sportTasks.filter(
    (t) => t.is_create_active || t.is_resolve_active,
  ).length;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const planCreated24 = plans.filter(
    (p) => new Date(p.created_at).getTime() >= dayAgo,
  ).length;
  const runningPlans = plans.filter(
    (p) => p.status === "pending" || p.status === "running",
  ).length;
  return {
    totalTasks: cryptoTasks.length + sportTasks.length,
    activeTasks: activeCrypto + activeSport,
    created24: sum("created_last_24h") + planCreated24,
    failed24: sum("failed_last_24h"),
    awaitingVerify: sum("awaiting_verify_now"),
    awaitingPrice: sum("awaiting_price_count"),
    awaitingResolve: sum("awaiting_resolution"),
    runningPlans,
  };
}

