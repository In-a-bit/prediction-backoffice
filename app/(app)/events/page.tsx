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
  EventResponse,
  Interval,
  ManualEventListItem,
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
  const q = typeof sp.q === "string" ? sp.q : undefined;

  // Fan out per-source loaders. Each loader returns a small data envelope so
  // the tab component can stay free of fetch wiring.
  const [
    manualPayload,
    cryptoPayload,
    sportPayload,
    sourceCounts,
  ] = await Promise.all([
    source === "manual" ? loadManual(q) : Promise.resolve(emptyManualPayload()),
    source === "crypto" ? loadCrypto(q) : Promise.resolve(emptyCryptoPayload()),
    source === "sport" ? loadSport(q) : Promise.resolve(emptySportPayload()),
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
            <ManualEventsTab data={manualPayload} initialQ={q ?? ""} />
          ) : source === "crypto" ? (
            <CryptoEventsTab data={cryptoPayload} initialQ={q ?? ""} />
          ) : (
            <SportEventsTab data={sportPayload} initialQ={q ?? ""} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data loaders — one per source. Each returns its own envelope shape.
// When q is set the loader scans the full dataset and pre-filters by q so the
// client-side search covers everything, not just the first page window.
// ---------------------------------------------------------------------------

function emptyManualPayload(): ManualPayload {
  return { rows: [], knownSeries: [], error: null };
}

async function loadManual(q?: string): Promise<ManualPayload> {
  const titleCap = q ? Infinity : 50;
  const eventLimit = q ? 2000 : 100;

  let manualEvents: ManualEventListItem[] = [];
  try {
    const resp = await manual.listEvents({ limit: eventLimit });
    manualEvents = resp.items;
  } catch (err) {
    return { rows: [], knownSeries: [], error: stringifyError(err) };
  }

  // Enrich a capped subset with live dpm-api data (title, active, closed …).
  const toEnrich = manualEvents.slice(0, titleCap);
  const dpmEvents = await Promise.all(
    toEnrich
      .filter((e) => !!e.event_external_id)
      .map(async (e) => {
      try {
        const externalID = e.event_external_id as string;
        return [externalID, await manual.getEventByExternalId(externalID)] as const;
      } catch {
        return null;
      }
      }),
  );
  const byId = new Map<string, EventResponse>();
  for (const r of dpmEvents) if (r) byId.set(r[0], r[1]);

  const knownSeries = new Map<number, { id: number; slug: string }>();

  let rows: ManualEventRow[] = [];

  for (const me of manualEvents) {
    const ev = me.event_external_id ? byId.get(me.event_external_id) : undefined;
    const seriesId = ev?.series_id ?? null;
    const seriesSlug = ev?.metadata?.series_slug as string | undefined;
    if (seriesId !== null && seriesSlug) {
      knownSeries.set(seriesId, { id: seriesId, slug: seriesSlug });
    }
    rows.push({
      external_id: me.event_external_id ?? "",
      title:
        (ev?.title && ev.title.trim()) ||
        (ev?.slug && ev.slug.trim()) ||
        me.event_slug,
      series: seriesSlug ?? null,
      series_id: seriesId,
      created_at: me.created_at,
      active: !!ev?.active,
      closed: !!ev?.closed,
      archived: !!ev?.archived,
      paused: !!ev?.paused,
      market_count: me.market_count,
      deployment_status: ev?.deployment_status ?? (me.event_external_id ? "UNKNOWN" : "PENDING"),
    });
  }

  if (q) {
    const query = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.title?.toLowerCase().includes(query) ||
        r.series?.toLowerCase().includes(query) ||
        r.external_id?.toLowerCase().includes(query),
    );
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

async function loadCrypto(q?: string): Promise<CryptoPayload> {
  try {
    const [tasksPage, assets, intervals] = await Promise.all([
      crypto.listTasks(),
      crypto.listAssets(),
      crypto.listIntervals(),
    ]);
    const tasks = tasksPage.data;
    const subset = q ? tasks : tasks.slice(0, PREVIEW_TASKS);
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

    let rows: CryptoEventRow[] = [];
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

    if (q) {
      const query = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.asset?.toLowerCase().includes(query) ||
          r.interval?.toLowerCase().includes(query) ||
          r.event_external_id?.toLowerCase().includes(query),
      );
    }

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

async function loadSport(q?: string): Promise<SportPayload> {
  try {
    const tasks = await sports.listTasks();
    const subset = q ? tasks : tasks.slice(0, PREVIEW_TASKS);
    const events = await Promise.all(
      subset.map((t) =>
        sports.listEvents(t.id).catch(() => [] as SportEvent[]),
      ),
    );
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    let rows: SportEventRow[] = [];
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

    if (q) {
      const query = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.match?.toLowerCase().includes(query) ||
          r.league?.toLowerCase().includes(query) ||
          r.country?.toLowerCase().includes(query) ||
          r.sport?.toLowerCase().includes(query) ||
          r.event_external_id?.toLowerCase().includes(query),
      );
    }

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
      .listEvents({ limit: 1 })
      .then((resp) => resp.total)
      .catch(() => 0),
    crypto
      .listTasks()
      .then(({ data: tasks }) =>
        Promise.all(
          tasks.map((t) =>
            crypto.listCryptoEvents(t.id).then((evs) => evs.length).catch(() => 0),
          ),
        ).then((counts) => counts.reduce((sum, c) => sum + c, 0)),
      )
      .catch(() => 0),
    sports
      .listTasks()
      .then((tasks) =>
        Promise.all(
          tasks.map((t) =>
            sports.listEvents(t.id).then((evs) => evs.length).catch(() => 0),
          ),
        ).then((counts) => counts.reduce((sum, c) => sum + c, 0)),
      )
      .catch(() => 0),
  ]);
  return { manual: manualCount, crypto: cryptoCount, sport: sportCount };
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}
