import {
  AutoRefresh,
} from "@/components/auto-refresh";
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
import { manual, type Paginated } from "@/lib/api";
import { loadMarketRows, type MarketRow } from "@/lib/market-rows";
import {
  extractPolymarketSlug,
  fetchSlugResolution,
  matchPolymarketMarket,
} from "@/lib/polymarket";
import type { DeployPlan, DeployPlanMarket, OperatorLogEntry } from "@/lib/types";

import { ResolutionsTable } from "./_table";
import { SlugProposedTable, type SlugProposedRow } from "./_slug-table";

export const dynamic = "force-dynamic";

type TabKey = UmaBucket | "first_time_disputed" | "slug_proposed";

const TAB_ORDER: { key: TabKey; label: string }[] = [
  { key: "ready_to_propose", label: "Ready to propose" },
  { key: "proposed", label: "Proposed" },
  { key: "challenge_period", label: "Challenge period" },
  { key: "disputed", label: "Disputed" },
  { key: "first_time_disputed", label: "First-time disputed" },
  { key: "slug_proposed", label: "Proposed by slug" },
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

  const [marketsResult, logResult, slugPlansResult] = await Promise.allSettled([
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
    // Load all manual deploy plans so we can find slug-sourced events.
    manual.listDeployPlans({ limit: 200 }),
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
    logResult.status === "fulfilled" ? logResult.value.data : [];
  const allPlans: DeployPlan[] =
    slugPlansResult.status === "fulfilled" && slugPlansResult.value
      ? Array.isArray(slugPlansResult.value)
        ? (slugPlansResult.value as DeployPlan[])
        : (slugPlansResult.value as Paginated<DeployPlan>).data ?? []
      : [];

  // Identify plans created from a Polymarket slug and fetch Gamma data for
  // each unique slug (in parallel, with graceful fallback per slug).
  const slugRows = await loadSlugProposedRows(allPlans);

  const counts = countBuckets(markets, log, slugRows);
  const filtered = filterFor(markets, log, tab);

  const tabs: Tab<TabKey>[] = TAB_ORDER.map((t) => ({
    key: t.key,
    label: t.label,
    href: `/resolutions?tab=${t.key}`,
    count: counts[t.key] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Resolution Manager"
          description="Single place to monitor and act on every UMA resolution across the platform. Tabs split markets by their current resolution state."
        />
        <div className="pt-1">
          <AutoRefresh intervalMs={5 * 60 * 1000} label="5 min refresh" />
        </div>
      </div>

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
              label="Proposed by slug"
              value={counts.slug_proposed}
              tone={counts.slug_proposed > 0 ? "info" : "neutral"}
              hint="Polymarket-side proposals"
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
          {tab === "slug_proposed" ? (
            <SlugProposedTable rows={slugRows} />
          ) : (
            <ResolutionsTable rows={filtered} log={log} tab={tab} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slug-proposed loading
// ---------------------------------------------------------------------------

/**
 * For every deploy plan that was created from a Polymarket slug:
 *  1. Fetch the Gamma event for that slug (deduplicated by slug).
 *  2. Filter to markets where umaResolutionStatus is "proposed" or "disputed".
 *  3. Cross-reference with our internal markets by question text.
 */
async function loadSlugProposedRows(plans: DeployPlan[]): Promise<SlugProposedRow[]> {
  // Build slug → plan mapping (one plan per slug is the norm).
  const slugPlanMap = new Map<string, DeployPlan>();
  for (const plan of plans) {
    const slug = extractPolymarketSlug(plan.note);
    if (slug) slugPlanMap.set(slug, plan);
  }

  if (slugPlanMap.size === 0) return [];

  // Fetch Gamma in parallel for each unique slug.
  const gammaResults = await Promise.allSettled(
    [...slugPlanMap.keys()].map((slug) =>
      fetchSlugResolution(slug).then((ev) => ({ slug, ev })),
    ),
  );

  const rows: SlugProposedRow[] = [];

  for (const result of gammaResults) {
    if (result.status !== "fulfilled") continue;
    const { slug, ev } = result.value;
    const plan = slugPlanMap.get(slug)!;

    for (const pm of ev.markets) {
      const status = pm.umaResolutionStatus;
      // Only surface markets that are actively in a propose/dispute state.
      if (status !== "proposed" && status !== "disputed") continue;

      // Try to match to one of our internal plan markets by question.
      const matched = matchPlanMarket(pm.question, plan.markets ?? []);

      rows.push({
        market_external_id: matched?.external_id ?? null,
        plan_external_id: plan.external_id,
        position: matched?.position ?? null,
        polymarket_slug: slug,
        question: pm.question,
        polymarket: pm,
      });
    }
  }

  return rows;
}

function matchPlanMarket(
  question: string,
  planMarkets: DeployPlanMarket[],
): DeployPlanMarket | null {
  const norm = normaliseQ(question);
  return planMarkets.find((m) => normaliseQ(m.question ?? "") === norm) ?? null;
}

function normaliseQ(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function countBuckets(
  markets: MarketRow[],
  log: OperatorLogEntry[],
  slugRows: SlugProposedRow[],
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
    slug_proposed: slugRows.length,
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
  if (tab === "slug_proposed") return []; // rendered separately via SlugProposedTable
  return markets.filter((m) => bucketUma(m.uma_resolution_status) === tab);
}
