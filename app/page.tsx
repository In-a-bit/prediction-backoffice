import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import { TaskCard } from "@/components/task-card";
import {
  Card,
  CardBody,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Stat,
  buttonVariants,
} from "@/components/ui";
import { listTasks } from "@/lib/api";
import type { Task, TaskStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let tasks: Task[] = [];
  let error: string | null = null;
  try {
    tasks = await listTasks({ withStats: true });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const totals = aggregate(tasks);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Live status of every active market task. Auto-refreshes every 15s."
        actions={<AutoRefresh />}
      />

      {error ? <ErrorMessage>Backoffice API unreachable: {error}</ErrorMessage> : null}

      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            <Stat
              label="Active tasks"
              value={`${totals.activeTasks}/${tasks.length}`}
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
              label="Awaiting price"
              value={totals.awaitingPrice}
              tone={totals.awaitingPrice > 0 ? "warning" : "neutral"}
            />
            <Stat
              label="Awaiting resolve"
              value={totals.awaitingResolve}
              tone={totals.awaitingResolve > 0 ? "warning" : "neutral"}
            />
          </div>
        </CardBody>
      </Card>

      {tasks.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No tasks yet"
            description="Create a task to start auto-creating up/down crypto markets for an asset and interval."
            action={
              <Link href="/tasks/new" className={buttonVariants.primary}>
                Create your first task
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function aggregate(tasks: Task[]) {
  const sum = (k: keyof TaskStats) =>
    tasks.reduce((acc, t) => acc + ((t.stats?.[k] as number) ?? 0), 0);
  return {
    activeTasks: tasks.filter(
      (t) => t.is_create_active || t.is_resolve_active,
    ).length,
    created24: sum("created_last_24h"),
    failed24: sum("failed_last_24h"),
    awaitingVerify: sum("awaiting_verify_now"),
    awaitingPrice: sum("awaiting_price_count"),
    awaitingResolve: sum("awaiting_resolution"),
  };
}
