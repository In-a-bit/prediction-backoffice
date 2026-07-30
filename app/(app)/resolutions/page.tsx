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
import {
  loadExternalMarketRows,
  type ExternalMarketRow,
} from "@/lib/external-proposals";
import { loadMarketRows, type MarketRow } from "@/lib/market-rows";
import type {
  ManualResolutionMarket,
  OperatorLogEntry,
  SportResolutionMarket,
} from "@/lib/types";
import { deriveSportLifecycle } from "@/lib/market-lifecycle";
import type { PlanSource } from "@/lib/source-from-plan";
import {
  EXTERNAL_TAB,
  EXTERNAL_TAB_LABEL,
  type ExternalKindCounts,
  type ExternalKindFilter,
} from "@/lib/resolution-tabs";
import { Pagination } from "./_pagination";
import { ResolutionsTable } from "./_table";

export const dynamic = "force-dynamic";

// The external tab sits outside the local_status buckets: a market that was
// proposed by an outside party has no backoffice propose step, so its urgency
// comes from the dpm-side external flags rather than from local_status.
type TabKey = LocalBucket | typeof EXTERNAL_TAB;

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: EXTERNAL_TAB,          label: EXTERNAL_TAB_LABEL },
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
  searchParams: Promise<{
    tab?: string;
    page?: string;
    q?: string;
    source?: string;
    external?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = isTabKey(sp.tab) ? sp.tab : "created";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const offset = (page - 1) * PER_PAGE;
  const q = sp.q?.trim() ?? "";
  const sourceFilter = sp.source ?? "";
  const externalFilter = parseExternalKind(sp.external);

  // Sport tabs drive paginated queries against the dedicated endpoint.
  // Non-sport tabs (manual UMA fallbacks, terminal) use base rows only.
  const isSportTab = SPORT_LOCAL_STATUSES.has(tab);
  const isExternalTab = tab === EXTERNAL_TAB;

  const [sportCountsResult, sportPageResult, manualCountsResult, manualPageResult, baseRowsResult, logResult, externalResult] =
    await Promise.allSettled([
      sports.listResolutionMarketCounts(),
      isSportTab
        ? sports.listResolutionMarkets({
            localStatus: tab,
            from: offset,
            limit: PER_PAGE,
          })
        : Promise.resolve({ items: [], total: 0, offset: 0, limit: PER_PAGE }),
      manual.listResolutionMarketCounts(),
      isExternalTab
        ? Promise.resolve({ items: [], total: 0, offset: 0, limit: 200 })
        : manual.listResolutionMarkets({ localStatus: tab, limit: 200 }),
      loadMarketRows({
        source: "all",
        hydrationCap: 60,
        planLimit: 80,
        taskLimit: 50,
        marketsPerTask: 200,
        q: q || undefined,
      }),
      manual.listOperatorLog({ limit: 200 }),
      // Always loaded: the tab badge must show pending external proposals and
      // disputes even while the operator is looking at another tab.
      loadExternalMarketRows(),
    ]);

  const sportCounts =
    sportCountsResult.status === "fulfilled" ? sportCountsResult.value : {};
  const sportPage =
    sportPageResult.status === "fulfilled"
      ? sportPageResult.value
      : { items: [], total: 0, offset: 0, limit: PER_PAGE };
  const manualCounts =
    manualCountsResult.status === "fulfilled" ? manualCountsResult.value : {};
  const manualPage =
    manualPageResult.status === "fulfilled"
      ? manualPageResult.value
      : { items: [], total: 0, offset: 0, limit: 200 };
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
  const externalRows: ExternalMarketRow[] =
    externalResult.status === "fulfilled" ? externalResult.value.rows : [];
  const externalError =
    externalResult.status === "fulfilled"
      ? externalResult.value.error
      : String(externalResult.reason);

  // Crypto markets come from loadMarketRows (no dedicated endpoint). Sport and
  // manual have dedicated DB endpoints that are authoritative for counts and
  // primary rows. We only use the base rows for crypto counting, but keep all
  // non-pending base rows for display so any market not covered by the
  // dedicated endpoints still appears (deduped below).
  const cryptoBaseRows = baseRows.filter(
    (r) => r.source !== "sport" && r.source !== "manual" && r.local_status !== "pending",
  );
  const cryptoCounts = countBuckets(cryptoBaseRows);

  // All base rows (including sport) used for supplemental display only.
  const allBaseRows = baseRows.filter((r) => r.local_status !== "pending");

  // Merge counts: dedicated DB endpoints are authoritative for sport/manual;
  // cryptoCounts covers everything else (avoids double-counting).
  const counts: Record<TabKey, number> = {} as Record<TabKey, number>;
  for (const t of TAB_ORDER) {
    counts[t.key] =
      (sportCounts[t.key] ?? 0) +
      (manualCounts[t.key] ?? 0) +
      (cryptoCounts[t.key] ?? 0);
  }
  // dpm-api is authoritative for the external flags, so this count replaces
  // rather than adds to the per-source ones.
  const externalCounts = countExternalKinds(externalRows);
  counts[EXTERNAL_TAB] = externalCounts.total;

  // For the current tab: sport rows (paginated) + manual rows (DB) + matching
  // non-DB rows from loadMarketRows. Deduplicate by external_id throughout.
  const allSportRows = sportPage.items.map(rowFromSportResolution);
  const allManualRows = manualPage.items.map(rowFromManualResolution);

  const sportExtIds = new Set(allSportRows.map((r) => r.market_external_id));
  const manualExtIds = new Set(allManualRows.map((r) => r.market_external_id));

  const allTabNonDbRows = isExternalTab
    ? []
    : filterFor(allBaseRows, tab).filter(
        (r) =>
          !sportExtIds.has(r.market_external_id) &&
          !manualExtIds.has(r.market_external_id),
      );

  // Apply source filter server-side so the table receives only the relevant rows.
  const sportRows = !sourceFilter || sourceFilter === "sport" ? allSportRows : [];
  const manualRows = !sourceFilter || sourceFilter === "manual" ? allManualRows : [];
  const tabNonDbRows = sourceFilter
    ? allTabNonDbRows.filter((r) => r.source === sourceFilter)
    : allTabNonDbRows;

  const displayed = isExternalTab
    ? applySourceFilter(filterExternalKind(externalRows, externalFilter), sourceFilter)
    : [...sportRows, ...manualRows, ...tabNonDbRows];

  // totalPages must reflect the filtered row count. If the source filter
  // narrows to manual/crypto, sport pagination is irrelevant (all rows are
  // already in-memory) — show 1 page. Otherwise use the sport total which is
  // authoritative for the server-paginated sport endpoint.
  const filteredTotal =
    sourceFilter && sourceFilter !== "sport"
      ? displayed.length
      : sportPage.total;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PER_PAGE));

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
        description="All sport and crypto markets by their current local_status, manual markets by UMA resolution state, and every market carrying an external proposal or dispute."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardBody>
            <Stat
              label="External"
              value={externalCounts.total}
              tone={externalCounts.total > 0 ? "danger" : "neutral"}
              hint={`${externalCounts.proposal} proposed, ${externalCounts.dispute} disputed by an outside party`}
            />
          </CardBody>
        </Card>
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

      {externalError ? (
        <ErrorMessage>
          External proposals and disputes unavailable: {externalError}
        </ErrorMessage>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <ResolutionsTable
            rows={displayed}
            log={log}
            tab={tab}
            initialQ={q}
            initialSource={sourceFilter}
            initialExternalKind={externalFilter}
            externalCounts={externalCounts}
          />
          {isSportTab && totalPages > 1 && (!sourceFilter || sourceFilter === "sport") && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={filteredTotal}
              perPage={PER_PAGE}
              tab={tab}
              q={q || undefined}
              source={sourceFilter || undefined}
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
    event_external_id: m.event_external_id ?? null,
    event_title: m.event_slug || null,
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
    has_external_proposal: null,
    has_external_dispute: null,
    lifecycle: deriveSportLifecycle(sportMarket),
    result: { kind: "pending", label: "Pending" },
    sortKey: new Date(m.updated_at).getTime(),
  };
}

function rowFromManualResolution(m: ManualResolutionMarket): MarketRow {
  return {
    market_external_id: m.market_external_id ?? `manual-${m.id}`,
    question: m.market_slug,
    source: "manual" as PlanSource,
    event_external_id: m.event_external_id ?? null,
    event_title: m.event_slug || null,
    series_slug: null,
    created_at: m.updated_at,
    manual_market_id: m.id,
    active: null,
    closed: null,
    accepting: null,
    accepting_orders_at: null,
    local_status: m.local_status,
    uma_resolution_status: null,
    uma_resolution_statuses: null,
    closed_time: null,
    has_external_proposal: null,
    has_external_dispute: null,
    lifecycle: { stages: [
      { key: "created" as const, status: m.local_status === "created" || m.local_status === "proposed" || m.local_status === "resolved" ? "done" as const : "pending" as const },
      { key: "proposed" as const, status: m.local_status === "proposed" || m.local_status === "resolved" ? "done" as const : "pending" as const },
      { key: "resolved" as const, status: m.local_status === "resolved" ? "done" as const : "pending" as const },
    ] },
    result: { kind: "pending" as const, label: "Pending" },
    sortKey: new Date(m.updated_at).getTime(),
  };
}

function applySourceFilter(rows: MarketRow[], sourceFilter: string): MarketRow[] {
  if (!sourceFilter) return rows;
  return rows.filter((r) => r.source === sourceFilter);
}

function parseExternalKind(value: string | undefined): ExternalKindFilter {
  return value === "proposal" || value === "dispute" ? value : "";
}

function filterExternalKind(
  rows: ExternalMarketRow[],
  kind: ExternalKindFilter,
): ExternalMarketRow[] {
  if (kind === "proposal") return rows.filter((r) => r.has_external_proposal);
  if (kind === "dispute") return rows.filter((r) => r.has_external_dispute);
  return rows;
}

// Counted on the unfiltered rows: the filter labels have to state how many
// disputes exist even while the operator is looking at proposals only. A market
// disputed by an outside party after our own proposal carries only the dispute
// flag, so the two kinds are counted independently.
function countExternalKinds(rows: ExternalMarketRow[]): ExternalKindCounts {
  return {
    total: rows.length,
    proposal: rows.filter((r) => r.has_external_proposal).length,
    dispute: rows.filter((r) => r.has_external_dispute).length,
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
