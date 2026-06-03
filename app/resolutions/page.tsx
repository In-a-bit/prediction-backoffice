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
  bucketUma,
  type UmaBucket,
} from "@/lib/aggregations";
import { manual } from "@/lib/api";
import { loadMarketRows, type MarketRow } from "@/lib/market-rows";
import type { DpmMarket, OperatorLogEntry } from "@/lib/types";
import type { PlanSource } from "@/lib/source-from-plan";

import { ResolutionsTable } from "./_table";

export const dynamic = "force-dynamic";

type TabKey = UmaBucket;

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: "initialized", label: "Initialized" },
  { key: "first_time_disputed", label: "First-time disputed" },
  { key: "proposed", label: "Proposed" },
  { key: "disputed", label: "Disputed" },
  { key: "resolved", label: "Resolved" },
];

function isTabKey(v: unknown): v is TabKey {
  return TAB_ORDER.some((t) => t.key === v);
}

export default async function ResolutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = isTabKey(sp.tab) ? sp.tab : "disputed";

  const [marketsResult, resolutionMarketsResult, logResult] =
    await Promise.allSettled([
      loadMarketRows({
        hydrationCap: 100,
        planLimit: 80,
        taskLimit: 5,
        marketsPerTask: 30,
      }),
      manual.listResolutionMarkets(),
      manual.listOperatorLog({ limit: 200 }),
    ]);

  const baseRows =
    marketsResult.status === "fulfilled" ? marketsResult.value.rows : [];
  const error =
    marketsResult.status === "rejected"
      ? marketsResult.reason instanceof Error
        ? marketsResult.reason.message
        : String(marketsResult.reason)
      : marketsResult.value.error;

  const resolutionMarkets =
    resolutionMarketsResult.status === "fulfilled"
      ? resolutionMarketsResult.value
      : [];

  const log: OperatorLogEntry[] =
    logResult.status === "fulfilled" ? logResult.value.data : [];

  // Merge: the dedicated resolution feed (which includes INITIALIZING markets
  // with dispute history, PROPOSED, DISPUTED, RESOLVED) takes precedence over
  // the general hydration results. Markets beyond the hydration cap get added
  // as stubs if they appear in the resolution feed.
  const markets = mergeResolutionData(baseRows, resolutionMarkets);

  const counts = countBuckets(markets);
  const filtered = filterFor(markets, tab);

  const tabs: Tab<TabKey>[] = TAB_ORDER.map((t) => ({
    key: t.key,
    label: t.label,
    href: `/resolutions?tab=${t.key}`,
    count: counts[t.key] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resolution Manager"
        description="Single place to monitor and act on every UMA resolution across the platform. Tabs split markets by their current resolution state."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardBody>
            <Stat
              label="Initialized"
              value={counts.initialized}
              hint="awaiting proposal"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="First-time disputed"
              value={counts.first_time_disputed}
              tone={counts.first_time_disputed > 0 ? "danger" : "neutral"}
              hint="needs re-proposal"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Proposed" value={counts.proposed} tone="info" />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Disputed"
              value={counts.disputed}
              tone={counts.disputed > 0 ? "danger" : "neutral"}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Resolved" value={counts.resolved} tone="success" />
          </CardBody>
        </Card>
      </div>

      <Tabs current={tab} tabs={tabs} label="Resolution status" />

      {error ? (
        <ErrorMessage>Source unreachable: {error}</ErrorMessage>
      ) : null}

      <Card>
        <CardBody>
          <ResolutionsTable rows={filtered} log={log} tab={tab} />
        </CardBody>
      </Card>
    </div>
  );
}

// mergeResolutionData ensures that markets from the dedicated DPM resolution
// feed are always present and have the correct uma_resolution_status and
// uma_resolution_statuses, even if they were beyond the hydration cap or
// not yet in the deploy-plan list.
function mergeResolutionData(
  base: MarketRow[],
  resolutionMarkets: DpmMarket[],
): MarketRow[] {
  if (resolutionMarkets.length === 0) return base;

  const byId = new Map<string, MarketRow>(
    base.map((r) => [r.market_external_id, r]),
  );

  for (const m of resolutionMarkets) {
    const existing = byId.get(m.external_id);
    if (existing) {
      byId.set(m.external_id, {
        ...existing,
        uma_resolution_status:
          m.uma_resolution_status ?? existing.uma_resolution_status,
        uma_resolution_statuses:
          m.uma_resolution_statuses ?? existing.uma_resolution_statuses,
        active: m.active ?? existing.active,
        closed: m.closed ?? existing.closed,
      });
    } else {
      byId.set(m.external_id, stubRowFromDpm(m));
    }
  }

  return [...byId.values()];
}

function stubRowFromDpm(m: DpmMarket): MarketRow {
  return {
    market_external_id: m.external_id,
    question: m.question,
    source: sourceFromMetadataType(m.metadata_type),
    event_external_id: null,
    event_title: null,
    series_slug: null,
    created_at: m.created_at,
    active: m.active,
    closed: m.closed,
    accepting: null,
    accepting_orders_at: m.accepting_orders_timestamp ?? null,
    uma_resolution_status: m.uma_resolution_status ?? null,
    uma_resolution_statuses: m.uma_resolution_statuses ?? null,
    closed_time: m.closed && m.end_date ? m.end_date : null,
    lifecycle: { stages: [] },
    result: { kind: "na", label: "" },
    sortKey: new Date(m.updated_at).getTime(),
  };
}

function sourceFromMetadataType(
  t: string | null | undefined,
): PlanSource {
  if (!t) return "manual";
  const lower = t.toLowerCase();
  if (lower.startsWith("sports")) return "sport";
  if (lower.startsWith("crypto")) return "crypto";
  return "manual";
}

function countBuckets(markets: MarketRow[]): Record<TabKey, number> {
  const counts: Record<TabKey, number> = {
    initialized: 0,
    first_time_disputed: 0,
    proposed: 0,
    disputed: 0,
    resolved: 0,
  };
  for (const m of markets) {
    const bucket = bucketUma(m.uma_resolution_status, m.uma_resolution_statuses);
    if (bucket !== null) counts[bucket]++;
  }
  return counts;
}

function filterFor(markets: MarketRow[], tab: TabKey): MarketRow[] {
  return markets.filter(
    (m) => bucketUma(m.uma_resolution_status, m.uma_resolution_statuses) === tab,
  );
}
