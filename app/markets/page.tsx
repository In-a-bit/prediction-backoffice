import Link from "next/link";

import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Tabs,
  type Tab,
} from "@/components/ui";
import { crypto, manual, sports } from "@/lib/api";
import { LifecycleStepper, ResultChip } from "@/components/market-lifecycle";
import { derive, type Lifecycle, type Result } from "@/lib/market-lifecycle";
import { inferSourceFromPlan, type PlanSource } from "@/lib/source-from-plan";
import type {
  DeployPlan,
  DeployPlanMarket,
  SportEvent,
  SportMarket,
  CryptoEvent,
  CryptoMarket,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// Inventory ▸ Markets — flat list of recent markets across all sources.
// Flat scan-by-market view (vs /events which groups by parent event). Each
// row deep-links into the unified market detail page with full
// ?source / plan_id / pos / sport_market_id context.

type SearchParams = {
  source?: string;
  status?: string;
};

// Sources we currently surface. "all" defaults to "manual" data because
// that's the only feed with a global "recent" list endpoint — crypto and
// sport are inherently task-scoped (the operator picks an interval/league),
// so for those we sample a couple of tasks to give a useful preview.
type Filter = "all" | PlanSource;

const TASK_PREVIEW_LIMIT = 5;
const MARKETS_PER_TASK = 20;

function parseFilter(v: string | undefined): Filter {
  if (v === "manual" || v === "crypto" || v === "sport") return v;
  return "all";
}

type Row = {
  question: string;
  source: PlanSource;
  marketExternalId?: string | null;
  lifecycle: Lifecycle;
  result: Result;
  // Deep-link context.
  planExternalId?: string;
  position?: number;
  sportMarketId?: number;
  cryptoEventId?: number;
  // Sort key (epoch ms).
  sortKey: number;
};

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.source);
  const statusFilter = sp.status?.trim() || undefined;

  let rows: Row[] = [];
  let error: string | null = null;

  try {
    if (filter === "manual" || filter === "all") {
      rows = rows.concat(await manualRows());
    }
    if (filter === "crypto" || filter === "all") {
      rows = rows.concat(await cryptoRows());
    }
    if (filter === "sport" || filter === "all") {
      rows = rows.concat(await sportRows());
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Dedupe — the same market external_id can appear in multiple plans (or
  // multiple crypto/sport tasks). Keep the most recent occurrence.
  const seen = new Map<string, Row>();
  const unkeyed: Row[] = [];
  for (const r of rows) {
    if (!r.marketExternalId) {
      unkeyed.push(r);
      continue;
    }
    const key = `${r.source}:${r.marketExternalId}`;
    const existing = seen.get(key);
    if (!existing || preferRow(r, existing)) seen.set(key, r);
  }
  rows = [...seen.values(), ...unkeyed];

  // Newest first.
  rows.sort((a, b) => b.sortKey - a.sortKey);

  const filtered = statusFilter
    ? rows.filter((r) =>
        r.lifecycle.stages.some(
          (s) => s.key.toLowerCase() === statusFilter.toLowerCase() && s.status === "active",
        ) ||
        r.result.label.toLowerCase() === statusFilter.toLowerCase(),
      )
    : rows;

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Markets"
        description="Every market the backoffice has produced, across every automation source. Click a row to drill into the full market page — same view as /markets/[external_id] reached from /events or a deploy plan."
      />

      <Tabs current={filter} tabs={buildSourceTabs()} label="Market source" />

      <Card>
        <CardBody>
          <form method="get" className="flex items-end gap-3 flex-wrap">
            {filter !== "all" ? (
              <input type="hidden" name="source" value={filter} />
            ) : null}
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
              Status
              <input
                type="text"
                name="status"
                defaultValue={statusFilter ?? ""}
                placeholder="e.g. created, proposed, resolved, won, lost"
                className="rounded-md border border-border bg-surface px-2 h-9 text-sm w-64 font-normal text-foreground"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm border border-border hover:bg-foreground/[0.04] cursor-pointer"
            >
              Apply
            </button>
            <p className="text-xs text-foreground-muted ml-auto">
              {summaryFor(filter, rows.length)}
            </p>
          </form>
        </CardBody>
      </Card>

      {error ? (
        <ErrorMessage>{error}</ErrorMessage>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No markets match"
          description="Try a different source tab or clear the status filter."
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((r, i) => (
            <RowItem key={`${r.source}-${r.marketExternalId ?? i}`} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function buildSourceTabs(): Tab<Filter>[] {
  return [
    { key: "all", label: "All", href: "/markets" },
    { key: "manual", label: "Manual", href: "/markets?source=manual" },
    { key: "crypto", label: "Crypto", href: "/markets?source=crypto" },
    { key: "sport", label: "Sport", href: "/markets?source=sport" },
  ];
}

function RowItem({ row }: { row: Row }) {
  const params = new URLSearchParams();
  params.set("source", row.source);
  if (row.planExternalId) params.set("plan_id", row.planExternalId);
  if (row.position !== undefined) params.set("pos", String(row.position));
  if (row.sportMarketId !== undefined)
    params.set("sport_market_id", String(row.sportMarketId));
  if (row.cryptoEventId !== undefined)
    params.set("crypto_event_id", String(row.cryptoEventId));
  const href = row.marketExternalId
    ? `/markets/${encodeURIComponent(row.marketExternalId)}?${params.toString()}`
    : null;

  return (
    <li>
      <div className="rounded-lg border border-border bg-surface px-4 py-3 flex items-center gap-3 flex-wrap hover:border-foreground/30 transition-colors">
        <Badge tone={sourceTone(row.source)}>{row.source}</Badge>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {row.question || (
            <span className="text-foreground-muted italic">(untitled)</span>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <LifecycleStepper lifecycle={row.lifecycle} variant="compact" />
          <ResultChip result={row.result} />
        </div>
        {href ? (
          <Link
            href={href}
            className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-foreground/[0.04] hover:border-foreground/40 transition-colors shrink-0"
          >
            Open →
          </Link>
        ) : (
          <span className="text-xs text-foreground-muted italic px-2">
            not deployed yet
          </span>
        )}
      </div>
    </li>
  );
}

// ----- Data loaders -----

async function manualRows(): Promise<Row[]> {
  let plans: DeployPlan[] = [];
  try {
    plans = await manual.listDeployPlans({ limit: 50 });
  } catch {
    return [];
  }
  const out: Row[] = [];
  for (const plan of plans) {
    const source = inferSourceFromPlan(plan);
    for (const m of plan.markets) {
      out.push(rowFromManual(m, plan, source));
    }
  }
  return out;
}

function rowFromManual(
  m: DeployPlanMarket,
  plan: DeployPlan,
  source: PlanSource,
): Row {
  const { lifecycle, result } = derive({
    source: "manual",
    planMarket: m,
  });
  return {
    question: m.question,
    source,
    marketExternalId: m.external_id,
    lifecycle,
    result,
    planExternalId: plan.external_id,
    position: m.position,
    sortKey: new Date(m.updated_at).getTime(),
  };
}

async function cryptoRows(): Promise<Row[]> {
  let tasks: Awaited<ReturnType<typeof crypto.listTasks>> = [];
  try {
    tasks = await crypto.listTasks();
  } catch {
    return [];
  }
  // Sample a few tasks to keep the page light; the operator can scope further
  // via /events?source=crypto&task_id=...
  const subset = tasks.slice(0, TASK_PREVIEW_LIMIT);
  const events = await Promise.all(
    subset.map(async (t) => {
      try {
        return await crypto.listCryptoEvents(t.id);
      } catch {
        return [] as CryptoEvent[];
      }
    }),
  );
  const out: Row[] = [];
  for (const list of events) {
    for (const ev of list) {
      for (const m of (ev.markets ?? []).slice(0, MARKETS_PER_TASK)) {
        out.push(rowFromCrypto(m, ev));
      }
    }
  }
  return out;
}

function rowFromCrypto(m: CryptoMarket, ev: CryptoEvent): Row {
  const { lifecycle, result } = derive({
    source: "crypto",
    cryptoMarket: m,
    cryptoEvent: ev,
  });
  return {
    question: m.market_slug,
    source: "crypto",
    marketExternalId: m.market_external_id,
    lifecycle,
    result,
    planExternalId: m.deploy_plan_external_id,
    position: m.deploy_plan_position,
    cryptoEventId: ev.id,
    sortKey: new Date(ev.slot_end ?? ev.slot_start ?? m.updated_at).getTime(),
  };
}

async function sportRows(): Promise<Row[]> {
  let tasks: Awaited<ReturnType<typeof sports.listTasks>> = [];
  try {
    tasks = await sports.listTasks();
  } catch {
    return [];
  }
  const subset = tasks.slice(0, TASK_PREVIEW_LIMIT);
  const events = await Promise.all(
    subset.map(async (t) => {
      try {
        return await sports.listEvents(t.id);
      } catch {
        return [] as SportEvent[];
      }
    }),
  );
  const out: Row[] = [];
  for (const list of events) {
    for (const ev of list) {
      for (const m of (ev.markets ?? []).slice(0, MARKETS_PER_TASK)) {
        out.push(rowFromSport(m, ev));
      }
    }
  }
  return out;
}

function rowFromSport(m: SportMarket, ev: SportEvent): Row {
  const { lifecycle, result } = derive({
    source: "sport",
    sportMarket: m,
    sportEvent: ev,
  });
  return {
    question: m.market_slug,
    source: "sport",
    marketExternalId: m.market_external_id,
    lifecycle,
    result,
    planExternalId: m.deploy_plan_external_id,
    position: m.deploy_plan_position,
    sportMarketId: m.id,
    sortKey: new Date(ev.kickoff_at ?? m.updated_at).getTime(),
  };
}

// ----- Helpers -----

function summaryFor(filter: Filter, total: number): string {
  if (filter === "all") return `${total} most recent across all sources`;
  if (filter === "manual") return `markets from the 50 most recent deploy plans`;
  return `markets from the ${TASK_PREVIEW_LIMIT} most recent ${filter} tasks (max ${MARKETS_PER_TASK} per event)`;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function sourceTone(s: PlanSource): Tone {
  return s === "sport" ? "info" : s === "crypto" ? "warning" : "neutral";
}

// When the manual loader and a source-specific loader both produce a row for
// the same external_id, prefer the row with a real result over the manual
// fallback (which always reports kind "na"). Within equal-richness rows,
// fall back to the more recent updated_at.
function preferRow(candidate: Row, existing: Row): boolean {
  const candidateRich = candidate.result.kind !== "na";
  const existingRich = existing.result.kind !== "na";
  if (candidateRich !== existingRich) return candidateRich;
  return candidate.sortKey > existing.sortKey;
}

