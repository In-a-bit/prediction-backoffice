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
  isFirstTimeDisputed,
  UMA_BUCKET_LABEL,
  type UmaBucket,
} from "@/lib/aggregations";
import { manual } from "@/lib/api";
import { loadMarketRows, type MarketRow } from "@/lib/market-rows";
import type { OperatorLogEntry } from "@/lib/types";

import { ResolutionsTable } from "./_table";

export const dynamic = "force-dynamic";

type TabKey = UmaBucket | "first_time_disputed";

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: "ready_to_propose", label: "Ready to propose" },
  { key: "proposed", label: "Proposed" },
  { key: "challenge_period", label: "Challenge period" },
  { key: "disputed", label: "Disputed" },
  { key: "first_time_disputed", label: "First-time disputed" },
  { key: "ready_to_request", label: "Ready to request" },
  { key: "settled", label: "Settled" },
  { key: "unstarted", label: "Not started" },
  { key: "unknown", label: "Unknown" },
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

  const [marketsResult, logResult] = await Promise.allSettled([
    loadMarketRows({
      // Resolutions cares about UMA-resolved markets, which can come from any
      // source — load with a slightly larger hydration cap so we don't miss
      // a fresh disputed market just because it was bumped down by recency.
      hydrationCap: 100,
      planLimit: 80,
      taskLimit: 5,
      marketsPerTask: 30,
    }),
    manual.listOperatorLog({ limit: 200 }),
  ]);

  const markets =
    marketsResult.status === "fulfilled" ? marketsResult.value.rows : [];
  const error =
    marketsResult.status === "rejected"
      ? marketsResult.reason instanceof Error
        ? marketsResult.reason.message
        : String(marketsResult.reason)
      : marketsResult.value.error;
  const log: OperatorLogEntry[] =
    logResult.status === "fulfilled" ? logResult.value : [];

  const counts = countBuckets(markets, log);
  const filtered = filterFor(markets, log, tab);

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardBody>
            <Stat
              label="Unresolved"
              value={
                counts.unstarted +
                counts.ready_to_request +
                counts.ready_to_propose
              }
              hint="not yet proposed"
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
            <Stat
              label="In challenge"
              value={counts.challenge_period}
              tone={counts.challenge_period > 0 ? "warning" : "neutral"}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Settled" value={counts.settled} tone="success" />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="First-time disputed"
              value={counts.first_time_disputed}
              tone={counts.first_time_disputed > 0 ? "danger" : "neutral"}
              hint="needs operator review"
            />
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

function countBuckets(
  markets: MarketRow[],
  log: OperatorLogEntry[],
): Record<TabKey, number> {
  const counts: Record<TabKey, number> = {
    unstarted: 0,
    ready_to_request: 0,
    ready_to_propose: 0,
    proposed: 0,
    disputed: 0,
    settled: 0,
    challenge_period: 0,
    unknown: 0,
    first_time_disputed: 0,
  };
  for (const m of markets) {
    const bucket = bucketUma(m.uma_resolution_status);
    counts[bucket]++;
    if (
      bucket === "disputed" &&
      isFirstTimeDisputed(m.market_external_id, log)
    ) {
      counts.first_time_disputed++;
    }
  }
  return counts;
}

function filterFor(
  markets: MarketRow[],
  log: OperatorLogEntry[],
  tab: TabKey,
): MarketRow[] {
  if (tab === "first_time_disputed") {
    return markets.filter(
      (m) =>
        bucketUma(m.uma_resolution_status) === "disputed" &&
        isFirstTimeDisputed(m.market_external_id, log),
    );
  }
  return markets.filter((m) => bucketUma(m.uma_resolution_status) === tab);
}
