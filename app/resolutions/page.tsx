import {
  Card,
  CardBody,
  ErrorMessage,
  PageHeader,
  Stat,
  Tabs,
  type Tab,
} from "@/components/ui";
import {
  bucketLocal,
  SPORT_LOCAL_STATUSES,
  type LocalBucket,
} from "@/lib/aggregations";
import { manual, sports } from "@/lib/api";
import { loadMarketRows, type MarketRow } from "@/lib/market-rows";
import type { OperatorLogEntry, SportResolutionMarket } from "@/lib/types";
import { deriveSportLifecycle } from "@/lib/market-lifecycle";
import type { PlanSource } from "@/lib/source-from-plan";
import { Pagination } from "./_pagination";
import { ResolutionsTable } from "./_table";

export const dynamic = "force-dynamic";

type TabKey = LocalBucket;

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: "pending",             label: "Pending" },
  { key: "created",             label: "Created" },
  { key: "proposing",           label: "Proposing" },
  { key: "proposed",            label: "Proposed" },
  { key: "reset",               label: "Reset" },
  { key: "disputed",            label: "Disputed" },
  { key: "resolving",           label: "Resolving" },
  { key: "resolved",            label: "Resolved" },
  { key: "refunded",            label: "Refunded" },
  { key: "cancelled",           label: "Cancelled" },
  { key: "failed",              label: "Failed" },
  { key: "uma_initializing",    label: "Initialized (manual)" },
  { key: "uma_proposed",        label: "Proposed (manual)" },
  { key: "uma_disputed",        label: "Disputed (manual)" },
  { key: "uma_resolved",        label: "Resolved (manual)" },
];

const PER_PAGE = 50;

function isTabKey(v: unknown): v is TabKey {
  return TAB_ORDER.some((t) => t.key === v);
}

export default async function ResolutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = isTabKey(sp.tab) ? sp.tab : "created";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const offset = (page - 1) * PER_PAGE;

  // Sport tabs drive paginated queries against the dedicated endpoint.
  // Non-sport tabs (manual UMA fallbacks, terminal) use base rows only.
  const isSportTab = SPORT_LOCAL_STATUSES.has(tab);

  const [sportCountsResult, sportPageResult, baseRowsResult, logResult] =
    await Promise.allSettled([
      sports.listResolutionMarketCounts(),
      isSportTab
        ? sports.listResolutionMarkets({
            localStatus: tab,
            from: offset,
            limit: PER_PAGE,
          })
        : Promise.resolve({ items: [], total: 0, offset: 0, limit: PER_PAGE }),
      loadMarketRows({
        source: "all",
        hydrationCap: 60,
        planLimit: 80,
        taskLimit: 5,
        marketsPerTask: 30,
      }),
      manual.listOperatorLog({ limit: 200 }),
    ]);

  const sportCounts =
    sportCountsResult.status === "fulfilled" ? sportCountsResult.value : {};
  const sportPage =
    sportPageResult.status === "fulfilled"
      ? sportPageResult.value
      : { items: [], total: 0, offset: 0, limit: PER_PAGE };
  const baseRows =
    baseRowsResult.status === "fulfilled" ? baseRowsResult.value.rows : [];
  const error =
    baseRowsResult.status === "rejected"
      ? baseRowsResult.reason instanceof Error
        ? baseRowsResult.reason.message
        : String(baseRowsResult.reason)
      : baseRowsResult.value.error;
  const log: OperatorLogEntry[] =
    logResult.status === "fulfilled" ? logResult.value.data : [];

  // Non-sport rows (crypto + manual) are still provided by loadMarketRows.
  const nonSportRows = baseRows.filter((r) => r.source !== "sport");
  const nonSportCounts = countBuckets(nonSportRows);

  // Merge counts: sport from dedicated endpoint, everything else from base rows.
  const counts: Record<TabKey, number> = {} as Record<TabKey, number>;
  for (const t of TAB_ORDER) {
    counts[t.key] =
      (sportCounts[t.key] ?? 0) + (nonSportCounts[t.key] ?? 0);
  }

  // For the current tab: sport rows (paginated) + matching non-sport rows.
  // Deduplicate by external_id so sport rows from loadMarketRows don't double-count.
  const sportRows = sportPage.items.map(rowFromSportResolution);
  const sportExtIds = new Set(sportRows.map((r) => r.market_external_id));
  const tabNonSportRows = filterFor(nonSportRows, tab).filter(
    (r) => !sportExtIds.has(r.market_external_id),
  );
  const displayed = [...sportRows, ...tabNonSportRows];

  const totalPages = Math.max(1, Math.ceil(sportPage.total / PER_PAGE));

  const tabs: Tab<TabKey>[] = TAB_ORDER.filter(
    (t) => counts[t.key] > 0 || t.key === tab,
  ).map((t) => ({
    key: t.key,
    label: t.label,
    href: `/resolutions?tab=${t.key}`,
    count: counts[t.key] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resolution Manager"
        description="All sport and crypto markets by their current local_status, plus manual markets by UMA resolution state."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardBody>
            <Stat
              label="Created"
              value={counts.created ?? 0}
              hint="awaiting proposal"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Reset"
              value={counts.reset ?? 0}
              tone={(counts.reset ?? 0) > 0 ? "danger" : "neutral"}
              hint="needs re-proposal"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Proposed"
              value={counts.proposed ?? 0}
              tone="info"
              hint="in liveness window"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Disputed"
              value={counts.disputed ?? 0}
              tone={(counts.disputed ?? 0) > 0 ? "danger" : "neutral"}
              hint="DVM vote in progress"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Resolved"
              value={(counts.resolved ?? 0) + (counts.uma_resolved ?? 0)}
              tone="success"
            />
          </CardBody>
        </Card>
      </div>

      <Tabs current={tab} tabs={tabs} label="Market status" />

      {error ? (
        <ErrorMessage>Source unreachable: {error}</ErrorMessage>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <ResolutionsTable rows={displayed} log={log} tab={tab} />
          {isSportTab && totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={sportPage.total}
              perPage={PER_PAGE}
              tab={tab}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function rowFromSportResolution(m: SportResolutionMarket): MarketRow {
  const sportMarket = {
    id: m.id,
    local_status: m.local_status,
    sport_market_type_id: 0,
    market_type_key: "",
    outcome_key: m.outcome_key,
    market_slug: m.market_slug,
    created_at: m.updated_at,
    updated_at: m.updated_at,
  } as import("@/lib/types").SportMarket;

  return {
    market_external_id: m.market_external_id ?? `sport-${m.id}`,
    question: m.market_slug,
    source: "sport" as PlanSource,
    event_external_id: null,
    event_title: null,
    series_slug: null,
    created_at: m.updated_at,
    sport_market_id: m.id,
    active: null,
    closed: null,
    accepting: null,
    accepting_orders_at: null,
    local_status: m.local_status,
    uma_resolution_status: null,
    uma_resolution_statuses: null,
    closed_time: null,
    lifecycle: deriveSportLifecycle(sportMarket),
    result: { kind: "pending", label: "Pending" },
    sortKey: new Date(m.updated_at).getTime(),
  };
}

function countBuckets(markets: MarketRow[]): Partial<Record<TabKey, number>> {
  const counts: Partial<Record<TabKey, number>> = {};
  for (const m of markets) {
    const bucket = bucketLocal(m.source, m.local_status, m.uma_resolution_status);
    if (bucket !== null) counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

function filterFor(markets: MarketRow[], tab: TabKey): MarketRow[] {
  return markets.filter(
    (m) =>
      bucketLocal(m.source, m.local_status, m.uma_resolution_status) === tab,
  );
}
