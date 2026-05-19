import Link from "next/link";

import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorMessage,
  PageHeader,
} from "@/components/ui";
import { crypto, manual, sports } from "@/lib/api";
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
  // Status badges, in display order.
  statuses: { label: string; tone: Tone }[];
  // Deep-link context.
  planExternalId?: string;
  position?: number;
  sportMarketId?: number;
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
    if (!existing || r.sortKey > existing.sortKey) seen.set(key, r);
  }
  rows = [...seen.values(), ...unkeyed];

  // Newest first.
  rows.sort((a, b) => b.sortKey - a.sortKey);

  const filtered = statusFilter
    ? rows.filter((r) => r.statuses.some((s) => s.label === statusFilter))
    : rows;

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Markets"
        description="Every market the backoffice has produced, across every automation source. Click a row to drill into the full market page — same view as /markets/[external_id] reached from /events or a deploy plan."
      />

      <SourceTabs current={filter} />

      <Card>
        <CardBody>
          <form method="get" className="flex items-end gap-3 flex-wrap">
            {filter !== "all" ? (
              <input type="hidden" name="source" value={filter} />
            ) : null}
            <label className="flex flex-col gap-1 text-xs">
              status
              <input
                type="text"
                name="status"
                defaultValue={statusFilter ?? ""}
                placeholder="e.g. deployed, REGISTERED, PROPOSED"
                className="rounded-md border border-border bg-surface px-2 py-1 text-sm w-64"
              />
            </label>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-foreground/[0.04]"
            >
              Apply
            </button>
            <p className="text-[11px] text-foreground-muted ml-auto">
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

function SourceTabs({ current }: { current: Filter }) {
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "manual", label: "Manual" },
    { key: "crypto", label: "Crypto" },
    { key: "sport", label: "Sport" },
  ];
  return (
    <div className="flex items-center gap-2">
      {tabs.map((t) => {
        const active = current === t.key;
        const href = t.key === "all" ? "/markets" : `/markets?source=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
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

function RowItem({ row }: { row: Row }) {
  const params = new URLSearchParams();
  params.set("source", row.source);
  if (row.planExternalId) params.set("plan_id", row.planExternalId);
  if (row.position !== undefined) params.set("pos", String(row.position));
  if (row.sportMarketId !== undefined)
    params.set("sport_market_id", String(row.sportMarketId));
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
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {row.statuses.map((s, i) => (
            <Badge key={i} tone={s.tone}>
              {s.label}
            </Badge>
          ))}
        </div>
        {href ? (
          <Link
            href={href}
            className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-foreground/[0.04] hover:border-foreground/40 transition-colors shrink-0"
          >
            Open →
          </Link>
        ) : (
          <span className="text-[11px] text-foreground-muted italic px-2">
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
  return {
    question: m.question,
    source,
    marketExternalId: m.external_id,
    statuses: [{ label: m.status, tone: tonalize(m.status) }],
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
  return {
    question: m.market_slug,
    source: "crypto",
    marketExternalId: m.market_external_id,
    statuses: [{ label: m.local_status, tone: tonalize(m.local_status) }],
    planExternalId: m.deploy_plan_external_id,
    position: m.deploy_plan_position,
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
  return {
    question: m.market_slug,
    source: "sport",
    marketExternalId: m.market_external_id,
    statuses: [{ label: m.local_status, tone: tonalize(m.local_status) }],
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

function tonalize(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("deployed") || s.includes("registered") || s.includes("resolved") || s.includes("verified") || s.includes("succeed")) return "success";
  if (s.includes("fail") || s.includes("cancel") || s.includes("refund") || s.includes("dispute")) return "danger";
  if (s.includes("wait") || s.includes("pending") || s.includes("propos") || s.includes("paused")) return "warning";
  if (s.includes("running") || s.includes("submit") || s.includes("resolving") || s.includes("created") || s.includes("deploying") || s.includes("initializing")) return "info";
  return "neutral";
}

