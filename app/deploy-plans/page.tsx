import Link from "next/link";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { manual } from "@/lib/api";
import { formatDateTimeFull, formatRelative } from "@/lib/format";
import type { DeployPlan, DeployPlanMarketStatus, DeployPlanStatus } from "@/lib/types";

import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

// Source partitions every plan by who spawned it. Sports plans come from
// the SportsUpcomingTicker (actor = "sports-auto") or from a force-create
// in the sports UI (note starts with "sports/"). Everything else is manual.
type Source = "all" | "manual" | "sports";

function classifySource(plan: DeployPlan): Exclude<Source, "all"> {
  if (plan.actor === "sports-auto") return "sports";
  if (plan.note && plan.note.toLowerCase().startsWith("sports/")) return "sports";
  return "manual";
}

type SearchParams = {
  source?: string;
  status?: string;
  event_external_id?: string;
};

const ACTIVE_STATUSES: DeployPlanStatus[] = ["pending", "running", "paused"];

export default async function DeployPlansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const source: Source =
    sp.source === "manual" || sp.source === "sports" ? sp.source : "all";

  let plans: DeployPlan[] = [];
  let error: string | null = null;
  try {
    plans = await manual.listDeployPlans({
      status: sp.status,
      event_external_id: sp.event_external_id,
      limit: 200,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Source partition is computed after fetch — backend doesn't distinguish.
  const filtered =
    source === "all" ? plans : plans.filter((p) => classifySource(p) === source);

  const active = filtered.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const done = filtered.filter((p) => !ACTIVE_STATUSES.includes(p.status));
  const hasActive = active.length > 0;

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Deploy plans"
        description="Cross-cutting queue of market deploys — used by the manual creator and the sports automations alike. Each plan tracks one event's markets through submit → REGISTERED, surviving UI/server restarts. Open a plan to see live progress, recreate failed markets, or signal balance."
      />

      <SourceTabs current={source} sp={sp} />
      <FilterBar source={source} filters={sp} />

      {error ? (
        <Card>
          <CardBody className="text-sm text-danger">{error}</CardBody>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No deploy plans yet"
          description={
            source === "all"
              ? "Plans are created when a market batch is queued — either by the manual creator or by the sports upcoming-ticker. They live until you delete them."
              : `No ${source} plans match the current filter.`
          }
          action={
            source !== "sports" ? (
              <Link href="/automations/manual" className={buttonVariants.primary}>
                Create one
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <PlanGroup
            title="Active"
            subtitle={`${active.length} running / paused / pending`}
            plans={active}
            emptyMessage="No active plans."
          />
          <PlanGroup
            title="Done"
            subtitle={`${done.length} completed / failed`}
            plans={done}
            emptyMessage="No completed plans yet."
          />
        </>
      )}

      {/* Auto-refresh while there are active plans, so the list reflects
          backend progress without forcing the operator to refresh by hand. */}
      {hasActive ? <AutoRefresh intervalMs={5000} /> : null}
    </div>
  );
}

// SourceTabs swap the `source` query param while preserving every other
// filter. Server-rendered links — same pattern as the operator log page.
function SourceTabs({ current, sp }: { current: Source; sp: SearchParams }) {
  const tabs: { key: Source; label: string }[] = [
    { key: "all", label: "All" },
    { key: "manual", label: "Manual" },
    { key: "sports", label: "Sports" },
  ];
  return (
    <div className="flex items-center gap-2">
      {tabs.map((t) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (k === "source" || v === undefined || v === "") continue;
          params.set(k, String(v));
        }
        if (t.key !== "all") params.set("source", t.key);
        const qs = params.toString();
        const active = current === t.key;
        return (
          <Link
            key={t.key}
            href={`/deploy-plans${qs ? `?${qs}` : ""}`}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              active
                ? "bg-foreground text-background border-foreground"
                : "border-border text-foreground-muted hover:text-foreground hover:bg-foreground/[0.04]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function PlanGroup({
  title,
  subtitle,
  plans,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  plans: DeployPlan[];
  emptyMessage: string;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          {title}
        </h2>
        <span className="text-[11px] text-foreground-muted">{subtitle}</span>
      </header>
      {plans.length === 0 ? (
        <p className="text-sm text-foreground-muted px-1">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {plans.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanRow({ plan }: { plan: DeployPlan }) {
  const counts = countByStatus(plan.markets.map((m) => m.status));
  const total = plan.markets.length;
  const source = classifySource(plan);
  return (
    <li>
      <Link
        href={`/deploy-plans/${encodeURIComponent(plan.external_id)}`}
        className="block"
      >
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <PlanStatusBadge status={plan.status} />
              <Badge tone={source === "sports" ? "info" : "neutral"}>{source}</Badge>
              <span className="text-sm font-medium truncate">
                {plan.note ?? `Plan ${plan.external_id.slice(0, 8)}`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-foreground-muted shrink-0">
              <span title={formatDateTimeFull(plan.created_at)}>
                created {formatRelative(plan.created_at)}
              </span>
              <span title={formatDateTimeFull(plan.updated_at)}>
                · updated {formatRelative(plan.updated_at)}
              </span>
            </div>
          </CardHeader>
          <CardBody className="text-xs space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                <span className="text-foreground-muted">progress: </span>
                {counts.deployed}/{total} deployed
                {counts.skipped ? <> · {counts.skipped} skipped</> : null}
                {counts.failed ? (
                  <>
                    {" "}· <span className="text-danger">{counts.failed} failed</span>
                  </>
                ) : null}
                {counts.waiting_for_balance ? (
                  <>
                    {" "}· <span className="text-warning">{counts.waiting_for_balance} waiting</span>
                  </>
                ) : null}
              </span>
              <span className="text-foreground-muted font-mono break-all">
                event: {plan.event_external_id}
              </span>
            </div>
          </CardBody>
        </Card>
      </Link>
    </li>
  );
}

function FilterBar({ source, filters }: { source: Source; filters: SearchParams }) {
  const statusOptions: ("" | DeployPlanStatus)[] = [
    "",
    "pending",
    "running",
    "paused",
    "completed",
    "failed",
  ];
  return (
    <Card>
      <CardBody>
        <form method="get" className="flex flex-wrap gap-2 items-end">
          {/* Preserve source across form submits via hidden input. */}
          {source !== "all" && <input type="hidden" name="source" value={source} />}
          <label className="flex flex-col gap-1 text-xs">
            status
            <select
              name="status"
              defaultValue={filters.status ?? ""}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s || "(any)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            event_external_id
            <input
              type="text"
              name="event_external_id"
              defaultValue={filters.event_external_id ?? ""}
              placeholder="UUID"
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-mono w-72"
            />
          </label>
          <button type="submit" className={buttonVariants.secondary}>
            Filter
          </button>
        </form>
      </CardBody>
    </Card>
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

function countByStatus(statuses: DeployPlanMarketStatus[]) {
  const out: Record<DeployPlanMarketStatus, number> = {
    idle: 0,
    submitting: 0,
    running: 0,
    waiting_for_balance: 0,
    deployed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const s of statuses) out[s] = (out[s] ?? 0) + 1;
  return out;
}
