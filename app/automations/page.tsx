import Link from "next/link";

import {
  Badge,
  Card,
  ErrorMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { crypto } from "@/lib/api";
import { type Behavior, behaviorList } from "@/lib/behaviors";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AutomationsHubPage() {
  let tasks: Task[] = [];
  let error: string | null = null;
  try {
    tasks = await crypto.listTasks({ withStats: true });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const cryptoActive = tasks.filter(
    (t) => t.is_create_active || t.is_resolve_active,
  ).length;

  const counts: Record<string, { total: number; active: number }> = {
    "crypto-interval": { total: tasks.length, active: cryptoActive },
    manual: { total: 0, active: 0 },
    sports: { total: 0, active: 0 },
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Automations"
        description="Each behavior is its own engine for keeping prediction markets created and resolved. Pick a behavior to operate it, or create a new automation of any type."
      />

      {error ? (
        <ErrorMessage>Backoffice API unreachable: {error}</ErrorMessage>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {behaviorList.map((b) => (
          <BehaviorCard
            key={b.key}
            behavior={b}
            count={counts[b.key]?.total ?? 0}
            active={counts[b.key]?.active ?? 0}
          />
        ))}
      </div>
    </div>
  );
}

function BehaviorCard({
  behavior,
  count,
  active,
}: {
  behavior: Behavior;
  count: number;
  active: number;
}) {
  const isAvailable = behavior.status === "available";
  return (
    <Card className="overflow-hidden flex flex-col">
      <div
        className="h-1.5"
        style={{ backgroundColor: behavior.accent }}
        aria-hidden
      />
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: behavior.accentSoft,
              color: behavior.accent,
            }}
          >
            <span className="h-6 w-6">{behavior.icon}</span>
          </div>
          {isAvailable ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="neutral">Coming soon</Badge>
          )}
        </div>

        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          {behavior.name}
        </h2>
        <p className="text-sm text-foreground-muted mt-1">
          {behavior.tagline}
        </p>

        <ul className="mt-4 space-y-1.5 text-sm">
          {behavior.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-foreground-muted">
              <span
                aria-hidden
                className="mt-1.5 h-1 w-1 rounded-full shrink-0"
                style={{ backgroundColor: behavior.accent }}
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="flex-1" />

        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
          <div className="text-sm">
            {isAvailable ? (
              <span className="text-foreground-muted">
                <span className="text-foreground font-semibold tabular-nums">
                  {active}
                </span>{" "}
                active{" "}
                <span className="text-foreground-muted">
                  / {count} total
                </span>
              </span>
            ) : (
              <span className="text-foreground-muted">Not yet wired up</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAvailable ? (
              <>
                <Link
                  href={behavior.href}
                  className={buttonVariants.secondary}
                >
                  Open
                </Link>
                <Link
                  href={behavior.newHref}
                  className={buttonVariants.primary}
                >
                  New
                </Link>
              </>
            ) : (
              <Link href={behavior.href} className={buttonVariants.secondary}>
                Preview
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
