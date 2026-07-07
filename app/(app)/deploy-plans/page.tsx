import Link from "next/link";

import { Pagination } from "@/components/pagination";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Tabs,
  type Tab,
  buttonVariants,
} from "@/components/ui";
import { type Paginated, manual } from "@/lib/api";
import { formatDateTimeFull, formatRelative } from "@/lib/format";
import type { DeployPlan, DeployPlanMarketStatus, DeployPlanStatus } from "@/lib/types";

import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

// Source partitions every plan by who spawned it.
//   - sports: SportsUpcomingTicker (actor="sports-auto") or note starts with "sports/"
//   - crypto: CryptoCreator       (actor="crypto-auto")  or note starts with "crypto/"
//   - manual: everything else (operator-driven via the manual creator)
type Source = "all" | "manual" | "sports" | "crypto";

function classifySource(plan: DeployPlan): Exclude<Source, "all"> {
  if (plan.actor === "sports-auto") return "sports";
  if (plan.note && plan.note.toLowerCase().startsWith("sports/")) return "sports";
  if (plan.actor === "crypto-auto") return "crypto";
  if (plan.note && plan.note.toLowerCase().startsWith("crypto/")) return "crypto";
  return "manual";
}

function sourceBadgeTone(s: Exclude<Source, "all">): "info" | "warning" | "neutral" {
  switch (s) {
    case "sports":
      return "info";
    case "crypto":
      return "warning"; // amber, matches behaviors.tsx accent for crypto-interval
    default:
      return "neutral";
  }
}

type SearchParams = {
  source?: string;
  status?: string;
  event_external_id?: string;
  page?: string;
  per_page?: string;
};

const DEFAULT_PER_PAGE = 25;

function clampPerPage(n: number): number {
  return [10, 25, 50, 100].includes(n) ? n : DEFAULT_PER_PAGE;
}

const ACTIVE_STATUSES: DeployPlanStatus[] = ["pending", "running", "paused"];

export default async function DeployPlansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const source: Source =
    sp.source === "manual" || sp.source === "sports" || sp.source === "crypto"
      ? sp.source
      : "all";

  const perPage = clampPerPage(Number(sp.per_page) || DEFAULT_PER_PAGE);
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * perPage;

  let result: Paginated<DeployPlan> = { data: [], total: 0, limit: perPage, offset };
  let error: string | null = null;
  try {
    result = await manual.listDeployPlans({
      status: sp.status,
      event_external_id: sp.event_external_id,
      limit: perPage,
      offset,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Source partition is computed after fetch — backend doesn't filter by source.
  const filtered =
    source === "all" ? result.data : result.data.filter((p) => classifySource(p) === source);

  const active = filtered.filter((p) => ACTIVE_STATUSES.includes(p.status));
  const done = filtered.filter((p) => !ACTIVE_STATUSES.includes(p.status));
  const hasActive = active.length > 0;

  // basePath carries existing filters; the Pagination component merges page/per_page.
  const paginationBasePath = (() => {
    const q = new URLSearchParams();
    if (source !== "all") q.set("source", source);
    if (sp.status) q.set("status", sp.status);
    if (sp.event_external_id) q.set("event_external_id", sp.event_external_id);
    const qs = q.toString();
    return `/deploy-plans${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Deploy plans"
        description="Cross-cutting queue of market deploys — used by the manual creator and the sports automations alike. Each plan tracks one event's markets through submit → REGISTERED, surviving UI/server restarts. Open a plan to see live progress or recreate failed markets."
      />

      <Tabs current={source} tabs={buildSourceTabs(sp)} label="Plan source" />
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
          <Card>
            <Pagination total={result.total} page={page} perPage={perPage} basePath={paginationBasePath} />
          </Card>
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
          <Card>
            <Pagination total={result.total} page={page} perPage={perPage} basePath={paginationBasePath} />
          </Card>
        </>
      )}

      {/* Auto-refresh while there are active plans, so the list reflects
          backend progress without forcing the operator to refresh by hand. */}
      {hasActive ? <AutoRefresh intervalMs={5000} /> : null}
    </div>
  );
}

// buildSourceTabs swaps the `source` query param while preserving every other
// filter on /deploy-plans (status, event_external_id). The tabs render via
// the shared Tabs primitive.
function buildSourceTabs(sp: SearchParams): Tab<Source>[] {
  const keys: Source[] = ["all", "manual", "sports", "crypto"];
  const labels: Record<Source, string> = {
    all: "All",
    manual: "Manual",
    sports: "Sports",
    crypto: "Crypto",
  };
  return keys.map((key) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "source" || v === undefined || v === "") continue;
      qs.set(k, String(v));
    }
    if (key !== "all") qs.set("source", key);
    const search = qs.toString();
    return {
      key,
      label: labels[key],
      href: `/deploy-plans${search ? `?${search}` : ""}`,
    };
  });
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
        <span className="text-xs text-foreground-muted">{subtitle}</span>
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
              <Badge tone={sourceBadgeTone(source)}>{source}</Badge>
              <span className="text-sm font-medium truncate">
                {plan.note ?? `Plan ${plan.external_id.slice(0, 8)}`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-foreground-muted shrink-0">
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
              <span
                className="text-foreground-muted font-mono break-all"
                title="DeployPlan.event_external_id — the dpm-api Event UUID this plan's markets attach to."
              >
                Event UUID: {plan.event_external_id.slice(0, 8)}…
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
        <form method="get" className="flex flex-wrap gap-3 items-end">
          {/* Preserve source across form submits via hidden input. */}
          {source !== "all" && <input type="hidden" name="source" value={source} />}
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
            Status
            <select
              name="status"
              defaultValue={filters.status ?? ""}
              className="rounded-md border border-border bg-surface px-2 h-9 text-sm font-normal text-foreground"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s || "(any)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
            Event UUID
            <input
              type="text"
              name="event_external_id"
              defaultValue={filters.event_external_id ?? ""}
              placeholder="paste event UUID"
              className="rounded-md border border-border bg-surface px-2 h-9 text-sm font-mono w-72 text-foreground"
            />
          </label>
          <button type="submit" className={buttonVariants.secondary}>
            Apply filter
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
