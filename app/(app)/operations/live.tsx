import Link from "next/link";

import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { DeployPlan, SportTask, Task } from "@/lib/types";

import { classifyPlans, timeAgo } from "./_helpers";

// LiveTab — three columns showing what's running right now per source.
// "Running" is sourced from deploy plans (status pending|running) so the
// view is unified across manual/crypto/sport. Plans link to their detail
// page where operators can pause/resume/recreate.

const ROW_LIMIT = 10;

function isLivePlan(p: DeployPlan): boolean {
  return p.status === "pending" || p.status === "running";
}

export function LiveTab({
  plans,
  cryptoTasks,
  sportTasks,
}: {
  plans: DeployPlan[];
  cryptoTasks: Task[];
  sportTasks: SportTask[];
}) {
  const live = plans.filter(isLivePlan);
  const bySource = classifyPlans(live);

  // Crypto + Sport "in-flight tasks" surfaced as a footer-style strip per
  // column so the operator sees the automation count alongside its plans.
  const activeCrypto = cryptoTasks.filter(
    (t) => t.is_create_active || t.is_resolve_active,
  ).length;
  const activeSport = sportTasks.filter(
    (t) => t.is_create_active || t.is_resolve_active,
  ).length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <LivePlanCard
        title="Manual · Live"
        plans={bySource.manual.slice(0, ROW_LIMIT)}
      />
      <LivePlanCard
        title="Crypto · Live"
        plans={bySource.crypto.slice(0, ROW_LIMIT)}
        footer={`${activeCrypto} active automation${activeCrypto === 1 ? "" : "s"}`}
      />
      <LivePlanCard
        title="Sport · Live"
        plans={bySource.sport.slice(0, ROW_LIMIT)}
        footer={`${activeSport} active automation${activeSport === 1 ? "" : "s"}`}
      />
    </div>
  );
}

function LivePlanCard({
  title,
  plans,
  footer,
}: {
  title: string;
  plans: DeployPlan[];
  footer?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          <Badge tone={plans.length > 0 ? "info" : "neutral"}>
            {plans.length} running
          </Badge>
        </div>
      </CardHeader>
      <CardBody className="!p-0">
        {plans.length === 0 ? (
          <EmptyState
            title="Nothing running"
            description="Plans appear here while their markets deploy or settle."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-foreground-muted">
                <tr className="border-b border-border">
                  <Th>Started</Th>
                  <Th>Plan</Th>
                  <Th>Markets</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const total = plan.markets.length;
                  const deployed = plan.markets.filter(
                    (m) => m.status === "deployed",
                  ).length;
                  const failed = plan.markets.filter(
                    (m) => m.status === "failed",
                  ).length;
                  return (
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
                      <Td className="tabular-nums text-xs">
                        <span className="text-success">{deployed}</span>
                        <span className="text-foreground-muted">/</span>
                        <span>{total}</span>
                        {failed > 0 ? (
                          <span className="ml-2 text-danger">· {failed} failed</span>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge
                          tone={plan.status === "running" ? "info" : "warning"}
                        >
                          {plan.status}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {footer ? (
          <div className="px-4 py-2.5 border-t border-border text-[11px] text-foreground-muted uppercase tracking-wider">
            {footer}
          </div>
        ) : null}
      </CardBody>
    </Card>
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
