import {
  Card,
  CardBody,
  ErrorMessage,
  PageHeader,
  Tabs,
  buttonVariants,
  type Tab,
} from "@/components/ui";
import { crypto, manual, sports } from "@/lib/api";
import type {
  Asset,
  CryptoEvent,
  DeployPlan,
  EventResponse,
  Interval,
  SportEvent,
  SportTask,
  Task,
} from "@/lib/types";

import { CryptoEventsTab } from "./_crypto-tab";
import { ManualEventsTab } from "./_manual-tab";
import { SportEventsTab } from "./_sport-tab";
import type {
  CryptoEventRow,
  CryptoPayload,
  ManualEventRow,
  ManualPayload,
  SportEventRow,
  SportPayload,
} from "./_types";

export const dynamic = "force-dynamic";

// /events — per-source tabs (Manual / Crypto / Sport). Each tab fetches the
// data shape it actually needs and renders a DataTable with columns that
// match. Layout follows the events-a v2 canvas.

type Source = "manual" | "crypto" | "sport";

function isSource(v: unknown): v is Source {
  return v === "manual" || v === "crypto" || v === "sport";
}

const PREVIEW_TASKS = 5;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const source: Source = isSource(sp.source) ? sp.source : "manual";

  // Fan out per-source loaders. Each loader returns a small data envelope so
  // the tab component can stay free of fetch wiring.
  const [
    manualPayload,
    cryptoPayload,
    sportPayload,
    sourceCounts,
  ] = await Promise.all([
    source === "manual" ? loadManual() : Promise.resolve(emptyManualPayload()),
    source === "crypto" ? loadCrypto() : Promise.resolve(emptyCryptoPayload()),
    source === "sport" ? loadSport() : Promise.resolve(emptySportPayload()),
    countAcrossSources(),
  ]);

  const tabs: Tab<Source>[] = [
    {
      key: "manual",
      label: "Manual",
      href: "/events?source=manual",
      count: sourceCounts.manual,
    },
    {
      key: "crypto",
      label: "Crypto",
      href: "/events?source=crypto",
      count: sourceCounts.crypto,
    },
    {
      key: "sport",
      label: "Sport",
      href: "/events?source=sport",
      count: sourceCounts.sport,
    },
  ];

  const apiError =
    source === "manual"
      ? manualPayload.error
      : source === "crypto"
        ? cryptoPayload.error
        : sportPayload.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Per-source tabs swap the column set + filters so each tab matches the data shape behind it."
        actions={
          source === "manual" ? (
            <a
              href="/automations/manual/events/new"
              className={buttonVariants.primary}
            >
              New event
            </a>
          ) : null
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs current={source} tabs={tabs} label="Event source" />
        <span className="text-xs text-foreground-muted">
          counts reflect the source-specific data preview
        </span>
      </div>

      {apiError ? (
        <ErrorMessage>Source unreachable: {apiError}</ErrorMessage>
      ) : null}

      <Card>
        <CardBody>
          {source === "manual" ? (
            <ManualEventsTab data={manualPayload} />
          ) : source === "crypto" ? (
            <CryptoEventsTab data={cryptoPayload} />
          ) : (
            <SportEventsTab data={sportPayload} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data loaders — one per source. Each returns its own envelope shape.
// ---------------------------------------------------------------------------

function emptyManualPayload(): ManualPayload {
  return { rows: [], knownSeries: [], error: null };
}

async function loadManual(): Promise<ManualPayload> {
  let plans: DeployPlan[] = [];
  try {
    plans = await manual.listDeployPlans({ limit: 80 });
  } catch (err) {
    return { rows: [], knownSeries: [], error: stringifyError(err) };
  }

  // Filter to operator-driven plans (skip auto plans — those go on their tabs).
  const manualPlans = plans.filter(
    (p) => p.actor !== "crypto-auto" && p.actor !== "sports-auto",
  );

  // Bucket by event so the row count is per-event rather than per-plan.
  const byEvent = new Map<string, DeployPlan[]>();
  for (const p of manualPlans) {
    const list = byEvent.get(p.event_external_id) ?? [];
    list.push(p);
    byEvent.set(p.event_external_id, list);
  }

  // Resolve titles in parallel — capped to keep TTFB low.
  const ids = [...byEvent.keys()].slice(0, 50);
  const events = await Promise.all(
    ids.map(async (id) => {
      try {
        return [id, await manual.getEventByExternalId(id)] as const;
      } catch {
        return null;
      }
    }),
  );
  const byId = new Map<string, EventResponse>();
  for (const r of events) if (r) byId.set(r[0], r[1]);

  // Series map — we'll derive slug from the event metadata if exposed; otherwise
  // we display the series_id and let the operator pick from a future series list.
  // The /manual/series/by-slug endpoint is keyed on slug, not id, so we don't
  // resolve every series id here. The known-series list is built below from
  // whatever rows surface a series_id so the filter dropdown stays scoped.
  const knownSeries = new Map<number, { id: number; slug: string }>();

  const rows: ManualEventRow[] = [];
  for (const [externalId, ps] of byEvent.entries()) {
    const ev = byId.get(externalId);
    const newest = ps.reduce((a, b) =>
      new Date(a.updated_at) > new Date(b.updated_at) ? a : b,
    );
    const marketCount = new Set(
      ps.flatMap((p) =>
        p.markets.map((m) => m.external_id ?? `pos-${p.id}-${m.position}`),
      ),
    ).size;
    const seriesId = ev?.series_id ?? null;
    const seriesSlug = ev?.metadata?.series_slug as string | undefined;
    if (seriesId !== null && seriesSlug) {
      knownSeries.set(seriesId, { id: seriesId, slug: seriesSlug });
    }

    rows.push({
      external_id: externalId,
      title:
        (ev?.title && ev.title.trim()) ||
        (ev?.slug && ev.slug.trim()) ||
        `Event ${externalId.slice(0, 8)}…`,
      series: seriesSlug ?? null,
      series_id: seriesId,
      created_at: ev?.created_at ?? newest.created_at,
      active: !!ev?.active,
      closed: !!ev?.closed,
      archived: !!ev?.archived,
      paused: !!ev?.paused,
      market_count: marketCount,
      deployment_status: ev?.deployment_status ?? newest.status,
    });
  }
  rows.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { rows, knownSeries: [...knownSeries.values()], error: null };
}

function emptyCryptoPayload(): CryptoPayload {
  return { rows: [], assets: [], intervals: [], tasks: [], error: null };
}

async function loadCrypto(): Promise<CryptoPayload> {
  try {
    const [tasks, assets, intervals] = await Promise.all([
      crypto.listTasks(),
      crypto.listAssets(),
      crypto.listIntervals(),
    ]);
    const subset = tasks.slice(0, PREVIEW_TASKS);
    const events = await Promise.all(
      subset.map((t) =>
        crypto.listCryptoEvents(t.id).catch(() => [] as CryptoEvent[]),
      ),
    );
    const assetById = new Map(assets.map((a) => [a.id, a]));
    const intervalById = new Map(intervals.map((i) => [i.id, i]));
    const taskMeta = new Map(
      tasks.map((t) => [
        t.id,
        {
          asset:
            assetById.get(t.asset_id)?.display_name ??
            assetById.get(t.asset_id)?.base ??
            `asset#${t.asset_id}`,
          interval: intervalById.get(t.interval_id)?.label ?? `interval#${t.interval_id}`,
        },
      ]),
    );

    const rows: CryptoEventRow[] = [];
    subset.forEach((t, idx) => {
      const meta = taskMeta.get(t.id);
      for (const ev of events[idx]) {
        if (!ev.event_external_id) continue;
        rows.push({
          event_external_id: ev.event_external_id,
          asset: meta?.asset ?? "—",
          interval: meta?.interval ?? "—",
          slot_start: ev.slot_start,
          slot_end: ev.slot_end,
          price_to_beat: ev.price_to_beat ?? null,
          price_at_close: ev.price_at_close ?? null,
          outcome: ev.decision?.outcome ?? null,
          market_count: ev.markets?.length ?? 0,
          is_skipped: ev.is_skipped_by_operator,
        });
      }
    });
    rows.sort(
      (a, b) => new Date(b.slot_end).getTime() - new Date(a.slot_end).getTime(),
    );
    return { rows, assets, intervals, tasks, error: null };
  } catch (err) {
    return {
      rows: [],
      assets: [],
      intervals: [],
      tasks: [],
      error: stringifyError(err),
    };
  }
}

function emptySportPayload(): SportPayload {
  return { rows: [], tasks: [], error: null };
}

async function loadSport(): Promise<SportPayload> {
  try {
    const tasks = await sports.listTasks();
    const subset = tasks.slice(0, PREVIEW_TASKS);
    const events = await Promise.all(
      subset.map((t) =>
        sports.listEvents(t.id).catch(() => [] as SportEvent[]),
      ),
    );
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const rows: SportEventRow[] = [];
    subset.forEach((t, idx) => {
      const task = taskById.get(t.id);
      for (const ev of events[idx]) {
        if (!ev.event_external_id) continue;
        const fp = (ev.fixture_payload ?? {}) as Record<string, unknown>;
        const teams = (fp.teams ?? {}) as Record<string, unknown>;
        const home = (teams.home ?? {}) as Record<string, unknown>;
        const away = (teams.away ?? {}) as Record<string, unknown>;
        const league = (fp.league ?? {}) as Record<string, unknown>;
        rows.push({
          event_external_id: ev.event_external_id,
          sport: task?.sport_key ?? "—",
          country:
            (typeof league.country === "string" ? league.country : "") ||
            "—",
          league:
            (typeof league.name === "string" ? league.name : "") ||
            task?.league_slug ||
            "—",
          match:
            home.name && away.name
              ? `${home.name} vs ${away.name}`
              : ev.event_slug,
          kickoff_at: ev.kickoff_at,
          fixture_status_short: ev.fixture_status_short,
          market_count: ev.markets?.length ?? 0,
        });
      }
    });
    rows.sort(
      (a, b) =>
        new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime(),
    );
    return { rows, tasks, error: null };
  } catch (err) {
    return { rows: [], tasks: [], error: stringifyError(err) };
  }
}

// Cheap counts for the tab badges — separate calls so a slow source doesn't
// block the others.
async function countAcrossSources(): Promise<{
  manual: number;
  crypto: number;
  sport: number;
}> {
  const [manualCount, cryptoCount, sportCount] = await Promise.all([
    manual
      .listDeployPlans({ limit: 80 })
      .then(
        (plans) =>
          new Set(
            plans
              .filter((p) => p.actor !== "crypto-auto" && p.actor !== "sports-auto")
              .map((p) => p.event_external_id),
          ).size,
      )
      .catch(() => 0),
    crypto
      .listTasks()
      .then((tasks) => tasks.length)
      .catch(() => 0),
    sports
      .listTasks()
      .then((tasks) => tasks.length)
      .catch(() => 0),
  ]);
  return { manual: manualCount, crypto: cryptoCount, sport: sportCount };
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}
