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
import { inlineSportOutcome, inlineCryptoOutcome } from "@/components/event-outcome";
import { crypto, manual, sports } from "@/lib/api";
import { inferSourceFromPlan, type PlanSource } from "@/lib/source-from-plan";
import type {
  Asset,
  CryptoEvent,
  DeployPlan,
  Interval,
  SportEvent,
  SportTask,
  Task,
} from "@/lib/types";

export const dynamic = "force-dynamic";

// Inventory ▸ Events — flat list of recent events across all sources. Each
// row links into the unified /events/[external_id] detail page (where every
// market is shown with inline actions).

type SearchParams = {
  source?: string;
  status?: string;
  task_id?: string;
};

type Filter = "all" | PlanSource;

const TASK_PREVIEW_LIMIT = 5;

function parseFilter(v: string | undefined): Filter {
  if (v === "manual" || v === "crypto" || v === "sport") return v;
  return "all";
}

type Row = {
  eventExternalId: string;
  title: string;
  source: PlanSource;
  marketCount: number;
  deploymentStatus?: string;
  subtitle?: string;
  flags: {
    paused?: boolean;
    closed?: boolean;
    archived?: boolean;
    active?: boolean;
    // fromPlan marks rows that came from manualRows() so mergeRows() knows
    // to trust their inferSourceFromPlan classification over the hardcoded
    // source from cryptoRows/sportRows.
    fromPlan?: boolean;
  };
  sortKey: number;
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.source);
  const statusFilter = sp.status?.trim() || undefined;
  const taskId = sp.task_id ? Number.parseInt(sp.task_id, 10) : undefined;
  const taskScoped = taskId !== undefined && Number.isFinite(taskId);

  // Tasks are needed both for the picker UI and (when one is selected) to
  // scope crypto/sport loaders. Fetch once and reuse.
  const [cryptoTasks, cryptoAssets, cryptoIntervals, sportTasks] =
    await Promise.all([
      filter === "crypto" || filter === "all"
        ? crypto.listTasks().catch(() => [] as Task[])
        : Promise.resolve([] as Task[]),
      filter === "crypto" || filter === "all"
        ? crypto.listAssets().catch(() => [] as Asset[])
        : Promise.resolve([] as Asset[]),
      filter === "crypto" || filter === "all"
        ? crypto.listIntervals().catch(() => [] as Interval[])
        : Promise.resolve([] as Interval[]),
      filter === "sport" || filter === "all"
        ? sports.listTasks().catch(() => [] as SportTask[])
        : Promise.resolve([] as SportTask[]),
    ]);

  let rows: Row[] = [];
  let error: string | null = null;

  try {
    // Always pull manual side — it's the only source with the dpm-api event
    // title AND a real marketCount (via plan.markets). The crypto/sport task
    // listings don't nest markets in their response, so without manual we'd
    // always show 0 markets for those rows.
    const loaders: Promise<Row[]>[] = [manualRows()];
    if (filter === "all" || filter === "crypto") {
      loaders.push(cryptoRows(cryptoTasks, taskScoped && filter === "crypto" ? taskId : undefined));
    }
    if (filter === "all" || filter === "sport") {
      loaders.push(sportRows(sportTasks, taskScoped && filter === "sport" ? taskId : undefined));
    }
    rows = (await Promise.all(loaders)).flat();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Merge by event_external_id — same event reported by multiple loaders
  // contributes different metadata: manual side has title + marketCount;
  // crypto/sport side has slot/kickoff subtitle. Take the best of each.
  const byEvent = new Map<string, Row>();
  for (const r of rows) {
    const existing = byEvent.get(r.eventExternalId);
    byEvent.set(r.eventExternalId, existing ? mergeRows(existing, r) : r);
  }
  rows = [...byEvent.values()];

  // Filter by selected source AFTER the merge so a crypto-auto plan surfaces
  // under the "crypto" tab (via inferSourceFromPlan), not under "manual".
  if (filter !== "all") {
    rows = rows.filter((r) => r.source === filter);
  }

  rows.sort((a, b) => b.sortKey - a.sortKey);

  const filtered = statusFilter
    ? rows.filter(
        (r) =>
          (r.deploymentStatus ?? "").toLowerCase() ===
          statusFilter.toLowerCase(),
      )
    : rows;

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Events"
        description="Every event the backoffice has touched, across every automation source. Each row drills into the unified event page — same view as /events/[external_id]."
      />

      <Tabs current={filter} tabs={buildSourceTabs()} label="Event source" />

      <Card>
        <CardBody>
          <form method="get" className="flex items-end gap-3 flex-wrap">
            {filter !== "all" ? (
              <input type="hidden" name="source" value={filter} />
            ) : null}
            {filter === "crypto" ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
                Task
                <select
                  name="task_id"
                  defaultValue={taskScoped ? String(taskId) : ""}
                  className="rounded-md border border-border bg-surface px-2 h-9 text-sm font-normal text-foreground"
                >
                  <option value="">— All tasks —</option>
                  {cryptoTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {labelCryptoTask(t, cryptoAssets, cryptoIntervals)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {filter === "sport" ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
                Task
                <select
                  name="task_id"
                  defaultValue={taskScoped ? String(taskId) : ""}
                  className="rounded-md border border-border bg-surface px-2 h-9 text-sm font-normal text-foreground"
                >
                  <option value="">— All tasks —</option>
                  {[...groupBySport(sportTasks).entries()].map(([sport, list]) => (
                    <optgroup key={sport} label={sport}>
                      {list.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.league_slug} · {t.api_season}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
              Deployment status
              <input
                type="text"
                name="status"
                defaultValue={statusFilter ?? ""}
                placeholder="e.g. REGISTERED, PENDING"
                className="rounded-md border border-border bg-surface px-2 h-9 text-sm w-56 font-normal text-foreground"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm border border-border hover:bg-foreground/[0.04] cursor-pointer"
            >
              Apply
            </button>
            <p className="text-xs text-foreground-muted ml-auto">
              {summaryFor(filter, rows.length, taskScoped)}
            </p>
          </form>
        </CardBody>
      </Card>

      {error ? (
        <ErrorMessage>{error}</ErrorMessage>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No events match"
          description="Try a different source tab or clear the filter."
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <RowItem key={`${r.source}-${r.eventExternalId}`} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function buildSourceTabs(): Tab<Filter>[] {
  return [
    { key: "all", label: "All", href: "/events" },
    { key: "manual", label: "Manual", href: "/events?source=manual" },
    { key: "crypto", label: "Crypto", href: "/events?source=crypto" },
    { key: "sport", label: "Sport", href: "/events?source=sport" },
  ];
}

function RowItem({ row }: { row: Row }) {
  const href = `/events/${encodeURIComponent(row.eventExternalId)}`;
  return (
    <li>
      <Link
        href={href}
        className="block rounded-lg border border-border bg-surface px-4 py-3 hover:border-foreground/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Badge tone={sourceTone(row.source)}>{row.source}</Badge>
          <span className="text-sm font-medium truncate flex-1 min-w-0">
            {row.title || (
              <span className="text-foreground-muted italic">
                {row.eventExternalId.slice(0, 8)}…
              </span>
            )}
          </span>
          <span className="text-xs text-foreground-muted shrink-0 tabular-nums">
            {row.marketCount} market{row.marketCount === 1 ? "" : "s"}
          </span>
          {row.deploymentStatus ? (
            <Badge tone={tonalize(row.deploymentStatus)}>
              {row.deploymentStatus}
            </Badge>
          ) : null}
          {row.flags.paused ? <Badge tone="warning">paused</Badge> : null}
          {row.flags.closed ? <Badge tone="neutral">closed</Badge> : null}
          {row.flags.archived ? <Badge tone="neutral">archived</Badge> : null}
          {row.flags.active ? <Badge tone="success">active</Badge> : null}
        </div>
        {row.subtitle ? (
          <p className="mt-1 text-xs text-foreground-muted truncate">
            {row.subtitle}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

// mergeRows combines two rows that describe the same event_external_id but
// were assembled by different loaders. Source comes from manualRows
// (inferSourceFromPlan is authoritative — it knows whether the plan was
// crypto-auto / sports-auto / manual-operator). Title prefers a real value
// over the "Event xxx…" UUID fallback. marketCount takes the max (manual
// side has the real plan.markets count; crypto/sport task list endpoints
// don't nest markets and report 0). Subtitle prefers the slot/kickoff
// metadata that crypto and sport loaders contribute.
function mergeRows(a: Row, b: Row): Row {
  // Source: trust whichever was derived from a deploy plan (manual loader)
  // because inferSourceFromPlan reads the actor. cryptoRows/sportRows
  // hardcode their source from the task type; if a plan disagrees, the
  // plan wins because it's closer to the actual provenance.
  const aFromPlan = a.flags.fromPlan === true;
  const bFromPlan = b.flags.fromPlan === true;
  const source = aFromPlan ? a.source : bFromPlan ? b.source : a.source;

  const aFallback = isFallbackTitle(a.title);
  const bFallback = isFallbackTitle(b.title);
  let title = a.title;
  if (aFallback && !bFallback) title = b.title;
  else if (!aFallback && bFallback) title = a.title;

  return {
    eventExternalId: a.eventExternalId,
    title,
    source,
    marketCount: Math.max(a.marketCount, b.marketCount),
    deploymentStatus: a.deploymentStatus ?? b.deploymentStatus,
    flags: { ...a.flags, ...b.flags },
    subtitle: a.subtitle ?? b.subtitle,
    sortKey: Math.max(a.sortKey, b.sortKey),
  };
}

function isFallbackTitle(t: string): boolean {
  return !t || /^Event [0-9a-f]{8}…$/i.test(t);
}

// ----- Data loaders -----

async function manualRows(): Promise<Row[]> {
  let plans: DeployPlan[] = [];
  try {
    plans = await manual.listDeployPlans({ limit: 50 });
  } catch {
    return [];
  }
  // Dedupe plans by event_external_id, keeping the most recent.
  const byEvent = new Map<string, DeployPlan[]>();
  for (const p of plans) {
    const list = byEvent.get(p.event_external_id) ?? [];
    list.push(p);
    byEvent.set(p.event_external_id, list);
  }
  // Resolve event titles in parallel (capped to keep the page snappy).
  const ids = [...byEvent.keys()].slice(0, 30);
  const titles = await Promise.all(
    ids.map(async (id) => {
      try {
        const ev = await manual.getEventByExternalId(id);
        return [id, ev] as const;
      } catch {
        return null;
      }
    }),
  );
  const titleMap = new Map<
    string,
    { title: string; slug: string; deployment_status: string }
  >();
  for (const r of titles) {
    if (r) {
      titleMap.set(r[0], {
        title: r[1].title,
        slug: r[1].slug,
        deployment_status: r[1].deployment_status,
      });
    }
  }

  const out: Row[] = [];
  for (const [eventExternalId, ps] of byEvent.entries()) {
    const newest = ps.reduce((a, b) =>
      new Date(a.updated_at) > new Date(b.updated_at) ? a : b,
    );
    const meta = titleMap.get(eventExternalId);
    const marketCount = new Set(
      ps.flatMap((p) =>
        p.markets.map((m) => m.external_id ?? `pos-${p.id}-${m.position}`),
      ),
    ).size;
    // Title fallback chain: dpm-api title → dpm-api slug → "Event xxx…".
    // Crypto-auto plans often have an empty event.title on dpm-api (the
    // event is auto-generated), but the slug carries the useful info.
    const title =
      (meta?.title && meta.title.trim()) ||
      (meta?.slug && meta.slug.trim()) ||
      `Event ${eventExternalId.slice(0, 8)}…`;
    out.push({
      eventExternalId,
      title,
      source: inferSourceFromPlan(newest),
      marketCount,
      deploymentStatus: meta?.deployment_status,
      flags: { fromPlan: true },
      sortKey: new Date(newest.updated_at).getTime(),
    });
  }
  return out;
}

async function cryptoRows(tasks: Task[], taskId?: number): Promise<Row[]> {
  // When the operator picked a specific task, restrict to it. Otherwise show
  // a preview across the first few tasks.
  const subset = taskId
    ? tasks.filter((t) => t.id === taskId)
    : tasks.slice(0, TASK_PREVIEW_LIMIT);
  const events = await Promise.all(
    subset.map(async (t) => {
      try {
        return await crypto.listCryptoEvents(t.id);
      } catch {
        return [] as CryptoEvent[];
      }
    }),
  );
  // Dedupe by event_external_id — the same event can be referenced by
  // multiple tasks (e.g. backfill plans).
  const byEvent = new Map<string, Row>();
  for (const list of events) {
    for (const ev of list) {
      if (!ev.event_external_id) continue;
      const existing = byEvent.get(ev.event_external_id);
      const outcomeLine = inlineCryptoOutcome(ev);
      const row: Row = {
        eventExternalId: ev.event_external_id,
        title: ev.event_slug || `crypto_event#${ev.id}`,
        source: "crypto",
        marketCount: ev.markets?.length ?? 0,
        flags: {},
        subtitle: outcomeLine
          ? `${outcomeLine} · ${ev.slot_start} → ${ev.slot_end}`
          : `${ev.slot_start} → ${ev.slot_end}`,
        sortKey: new Date(ev.slot_end ?? ev.created_at).getTime(),
      };
      if (!existing || row.sortKey > existing.sortKey) {
        byEvent.set(ev.event_external_id, row);
      }
    }
  }
  return [...byEvent.values()];
}

async function sportRows(tasks: SportTask[], taskId?: number): Promise<Row[]> {
  const subset = taskId
    ? tasks.filter((t) => t.id === taskId)
    : tasks.slice(0, TASK_PREVIEW_LIMIT);
  const events = await Promise.all(
    subset.map(async (t) => {
      try {
        return await sports.listEvents(t.id);
      } catch {
        return [] as SportEvent[];
      }
    }),
  );
  const byEvent = new Map<string, Row>();
  for (const list of events) {
    for (const ev of list) {
      if (!ev.event_external_id) continue;
      const existing = byEvent.get(ev.event_external_id);
      const outcomeLine = inlineSportOutcome(ev);
      const row: Row = {
        eventExternalId: ev.event_external_id,
        title: ev.event_slug || `sport_event#${ev.id}`,
        source: "sport",
        marketCount: ev.markets?.length ?? 0,
        flags: {},
        subtitle: outcomeLine
          ? `${outcomeLine} · kickoff ${ev.kickoff_at} · ${ev.fixture_status_short}`
          : `kickoff ${ev.kickoff_at} · ${ev.fixture_status_short}`,
        sortKey: new Date(ev.kickoff_at).getTime(),
      };
      if (!existing || row.sortKey > existing.sortKey) {
        byEvent.set(ev.event_external_id, row);
      }
    }
  }
  return [...byEvent.values()];
}

// ----- Helpers -----

function summaryFor(filter: Filter, total: number, taskScoped: boolean): string {
  if (filter === "all") return `${total} most recent events across all sources`;
  if (filter === "manual") return `events from the 50 most recent deploy plans`;
  if (taskScoped) return `events for the selected ${filter} task`;
  return `events from the ${TASK_PREVIEW_LIMIT} most recent ${filter} tasks`;
}

function labelCryptoTask(
  t: Task,
  assets: Asset[],
  intervals: Interval[],
): string {
  const a = t.asset ?? assets.find((x) => x.id === t.asset_id);
  const i = t.interval ?? intervals.find((x) => x.id === t.interval_id);
  const assetLabel = a?.display_name ?? a?.base ?? `asset#${t.asset_id}`;
  const intLabel = i?.label ?? `interval#${t.interval_id}`;
  return `${assetLabel} · ${intLabel}`;
}

function groupBySport(tasks: SportTask[]): Map<string, SportTask[]> {
  const out = new Map<string, SportTask[]>();
  for (const t of tasks) {
    const list = out.get(t.sport_key) ?? [];
    list.push(t);
    out.set(t.sport_key, list);
  }
  return out;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function sourceTone(s: PlanSource): Tone {
  return s === "sport" ? "info" : s === "crypto" ? "warning" : "neutral";
}

function tonalize(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("deployed") || s.includes("registered") || s.includes("resolved") || s.includes("succeed")) return "success";
  if (s.includes("fail") || s.includes("cancel") || s.includes("refund")) return "danger";
  if (s.includes("wait") || s.includes("pending") || s.includes("paused")) return "warning";
  if (s.includes("running") || s.includes("submit") || s.includes("resolving") || s.includes("created") || s.includes("deploying")) return "info";
  return "neutral";
}
