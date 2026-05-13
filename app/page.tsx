import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import { TaskCard } from "@/components/task-card";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Stat,
  buttonVariants,
} from "@/components/ui";
import { listTasks } from "@/lib/api";
import { type Behavior, behaviors } from "@/lib/behaviors";
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
    <div className="space-y-8">
      <PageHeader
        title="Operations"
        description="Live overview across every automation behavior. Auto-refreshes every 15s."
        actions={<AutoRefresh />}
      />

      {error ? (
        <ErrorMessage>Backoffice API unreachable: {error}</ErrorMessage>
      ) : null}

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

      <BehaviorSection
        behavior={behaviors["crypto-interval"]}
        rightSlot={
          <div className="flex items-center gap-2">
            <Link
              href={behaviors["crypto-interval"].href}
              className={buttonVariants.secondary}
            >
              All crypto tasks
            </Link>
            <Link
              href={behaviors["crypto-interval"].newHref}
              className={buttonVariants.primary}
            >
              New task
            </Link>
          </div>
        }
      >
        {tasks.length === 0 && !error ? (
          <Card>
            <EmptyState
              title="No crypto-interval tasks yet"
              description="Create a task to start auto-creating up/down crypto markets for an asset and interval."
              action={
                <Link
                  href={behaviors["crypto-interval"].newHref}
                  className={buttonVariants.primary}
                >
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
      </BehaviorSection>

      <BehaviorSection behavior={behaviors.manual}>
        <BehaviorPlaceholder behavior={behaviors.manual} />
      </BehaviorSection>

      <BehaviorSection behavior={behaviors.sports}>
        <BehaviorPlaceholder behavior={behaviors.sports} />
      </BehaviorSection>
    </div>
  );
}

function BehaviorSection({
  behavior,
  rightSlot,
  children,
}: {
  behavior: Behavior;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const available = behavior.status === "available";
  return (
    <section className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: behavior.accentSoft,
              color: behavior.accent,
            }}
          >
            <span className="h-5 w-5">{behavior.icon}</span>
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
              {behavior.name}
              {!available ? (
                <Badge tone="neutral">Coming soon</Badge>
              ) : null}
            </h2>
            <p className="text-xs text-foreground-muted">{behavior.tagline}</p>
          </div>
        </div>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function BehaviorPlaceholder({ behavior }: { behavior: Behavior }) {
  return (
    <Card className="overflow-hidden">
      <div
        className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{
          backgroundImage: `linear-gradient(135deg, ${behavior.accentSoft} 0%, transparent 75%)`,
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{behavior.description}</p>
        </div>
        <Link href={behavior.href} className={buttonVariants.secondary}>
          Preview behavior
        </Link>
      </div>
    </Card>
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
