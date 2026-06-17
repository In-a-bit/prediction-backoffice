import Link from "next/link";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { manual, sports, crypto as cryptoApi } from "@/lib/api";
import { SportOutcomeBlock, CryptoOutcomeBlock } from "@/components/event-outcome";
import { MarketOutcomeInline } from "@/components/market-outcome";
import { formatDateTimeFull, formatRelative } from "@/lib/format";
import { inferSourceFromPlan, type PlanSource } from "@/lib/source-from-plan";
import type {
  CryptoEvent,
  DeployPlan,
  DeployPlanMarket,
  EventResponse,
  MarketOutcome,
  MarketStatusVerdict,
  SportEvent,
} from "@/lib/types";

import { derive } from "@/lib/market-lifecycle";
import { LifecycleStepper, ResultChip } from "@/components/market-lifecycle";
import { EventActionsPanel } from "./event-actions-panel";
import { MarketActionsPanel } from "../../markets/[external_id]/market-actions-panel";

export const dynamic = "force-dynamic";

// Cap the parallel market-status fetches. Events can carry dozens of markets
// across backfill plans; this keeps the page snappy without paginating.
const MAX_MARKET_STATUS_FETCHES = 30;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ external_id: string }>;
}) {
  const { external_id } = await params;

  let event: EventResponse | null = null;
  let plans: DeployPlan[] = [];
  let fetchError: string | null = null;

  try {
    event = await manual.getEventByExternalId(external_id);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  try {
    plans = (await manual.listDeployPlans({ event_external_id: external_id })).data;
  } catch {
    // Soft-fail.
  }

  const source: PlanSource =
    plans.length > 0 ? inferSourceFromPlan(plans[0]!) : "manual";
  const rows = collectMarketRows(plans);

  // Fan out the verdict hydration alongside the parent-event scan — they share
  // no inputs and both can take measurable time on busy events.
  const [parentSportEvent, parentCryptoEvent, verdicts, outcomes] =
    await Promise.all([
      source === "sport"
        ? findParentSportEvent(external_id)
        : Promise.resolve(undefined),
      source === "crypto"
        ? findParentCryptoEvent(external_id)
        : Promise.resolve(undefined),
      hydrateVerdicts(rows),
      hydrateOutcomes(rows),
    ]);

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
      <Breadcrumbs source={source} />

      <PageHeader
        title={event?.title ?? `Event ${external_id.slice(0, 8)}`}
        description="dpm-api Event — operator surface. Inspect markets, take actions, drill into individual market pages."
        actions={
          <div className="flex gap-2">
            <Link
              href={`/automations/manual/events/${encodeURIComponent(external_id)}/markets/new`}
              className={buttonVariants.secondary}
            >
              + Add markets
            </Link>
            <Link
              href={`/deploy-plans?event_external_id=${encodeURIComponent(external_id)}`}
              className={buttonVariants.ghost}
            >
              All plans
            </Link>
          </div>
        }
      />

      {fetchError ? <ErrorMessage>{fetchError}</ErrorMessage> : null}

      {event ? <EventStatusStrip event={event} source={source} marketCount={rows.length} verdicts={verdicts} /> : null}

      {parentSportEvent ? <SportOutcomeBlock event={parentSportEvent} /> : null}
      {parentCryptoEvent ? <CryptoOutcomeBlock event={parentCryptoEvent} /> : null}

      {event ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
              Event actions
            </h2>
          </CardHeader>
          <CardBody>
            <EventActionsPanel externalId={external_id} event={event} />
          </CardBody>
        </Card>
      ) : null}

      {event ? <EventDetailsCard event={event} external_id={external_id} /> : null}

      <section className="space-y-3">
        <header className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
              Markets
            </h2>
            <span className="text-[11px] text-foreground-muted">
              {rows.length} total · derived from {plans.length} deploy plan
              {plans.length === 1 ? "" : "s"}
            </span>
          </div>
        </header>
        {rows.length === 0 ? (
          <EmptyState
            title="No markets yet"
            description="No deploy plans reference this event. Use “Add markets” to start one."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <MarketCard
                key={`${row.planExternalId}-${row.position}`}
                row={row}
                source={source}
                verdict={row.market.external_id ? verdicts.get(row.market.external_id) : undefined}
                outcome={row.market.external_id ? outcomes.get(row.market.external_id) : undefined}
                cryptoEventId={parentCryptoEvent?.id}
              />
            ))}
          </ul>
        )}
      </section>

      {plans.length > 0 ? (
        <section className="space-y-2">
          <header className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
              Related deploy plans
            </h2>
            <span className="text-[11px] text-foreground-muted">{plans.length}</span>
          </header>
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/deploy-plans/${encodeURIComponent(p.external_id)}`}>
                  <Card className="hover:shadow-md hover:border-foreground/30 transition-all">
                    <CardHeader className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge tone={planTone(p.status)}>{p.status}</Badge>
                        <span className="text-sm font-medium truncate">
                          {p.note ?? `Plan ${p.external_id.slice(0, 8)}`}
                        </span>
                        <span className="text-[11px] text-foreground-muted">
                          by {p.actor}
                        </span>
                      </div>
                      <span className="text-[11px] text-foreground-muted shrink-0">
                        {formatRelative(p.updated_at)}
                      </span>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------

type MarketRow = {
  market: DeployPlanMarket;
  planExternalId: string;
  position: number;
};

function collectMarketRows(plans: DeployPlan[]): MarketRow[] {
  const seen = new Map<string, MarketRow>();
  const unkeyed: MarketRow[] = [];
  for (const plan of plans) {
    for (const m of plan.markets) {
      const row: MarketRow = {
        market: m,
        planExternalId: plan.external_id,
        position: m.position,
      };
      if (m.external_id) {
        if (!seen.has(m.external_id)) seen.set(m.external_id, row);
      } else {
        unkeyed.push(row);
      }
    }
  }
  return [...seen.values(), ...unkeyed];
}

async function hydrateVerdicts(
  rows: MarketRow[],
): Promise<Map<string, MarketStatusVerdict>> {
  const ids = rows
    .map((r) => r.market.external_id)
    .filter((x): x is string => !!x)
    .slice(0, MAX_MARKET_STATUS_FETCHES);
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const v = await manual.getMarketStatus(id);
        return [id, v] as const;
      } catch {
        return null;
      }
    }),
  );
  const out = new Map<string, MarketStatusVerdict>();
  for (const r of results) if (r) out.set(r[0], r[1]);
  return out;
}

async function hydrateOutcomes(
  rows: MarketRow[],
): Promise<Map<string, MarketOutcome>> {
  const ids = rows
    .map((r) => r.market.external_id)
    .filter((x): x is string => !!x)
    .slice(0, MAX_MARKET_STATUS_FETCHES);
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const o = await manual.getMarketOutcome(id);
        return [id, o] as const;
      } catch {
        return null;
      }
    }),
  );
  const out = new Map<string, MarketOutcome>();
  for (const r of results) if (r) out.set(r[0], r[1]);
  return out;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Breadcrumbs({ source }: { source: PlanSource }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
      <Link href="/events" className="hover:text-foreground">
        Events
      </Link>
      <span>›</span>
      <Link href={`/events?source=${source}`} className="hover:text-foreground">
        {source}
      </Link>
      <span>›</span>
      <span className="text-foreground">event</span>
    </nav>
  );
}

function EventStatusStrip({
  event,
  source,
  marketCount,
  verdicts,
}: {
  event: EventResponse;
  source: PlanSource;
  marketCount: number;
  verdicts: Map<string, MarketStatusVerdict>;
}) {
  // Derive aggregate market progress so the operator can spot trouble at a
  // glance without expanding every row.
  let deployed = 0;
  let failing = 0;
  let pending = 0;
  for (const v of verdicts.values()) {
    if (v.status === "deployed") deployed++;
    else if (v.status === "failed") failing++;
    else pending++;
  }
  const items: { label: string; value: string; tone: Tone }[] = [
    { label: "source", value: source, tone: sourceTone(source) },
    {
      label: "deploy",
      value: event.deployment_status || "(none)",
      tone: tonalize(event.deployment_status || ""),
    },
    { label: "markets", value: String(marketCount), tone: "neutral" },
    { label: "deployed", value: String(deployed), tone: deployed ? "success" : "neutral" },
    { label: "pending", value: String(pending), tone: pending ? "warning" : "neutral" },
    { label: "failing", value: String(failing), tone: failing ? "danger" : "neutral" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg border border-border bg-surface px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
            {it.label}
          </div>
          <div className="mt-1">
            <Badge tone={it.tone}>{it.value}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventDetailsCard({
  event,
  external_id,
}: {
  event: EventResponse;
  external_id: string;
}) {
  // Every dpm-api EventResponse field, surfaced as a row. Values are coerced
  // to strings so the operator can see exactly what came back from the API —
  // including nullable/empty fields they might be debugging.
  const rows: { k: string; v: string | undefined | null; mono?: boolean }[] = [
    { k: "id", v: String(event.id) },
    { k: "external_id", v: external_id, mono: true },
    { k: "slug", v: event.slug },
    { k: "title", v: event.title },
    { k: "ticker", v: event.ticker ?? undefined },
    { k: "resolution_source", v: event.resolution_source ?? undefined },
    { k: "start_date", v: event.start_date ? formatDateTimeFull(event.start_date) : undefined },
    { k: "end_date", v: event.end_date ? formatDateTimeFull(event.end_date) : undefined },
    { k: "icon", v: event.icon ?? undefined, mono: true },
    { k: "deployment_status", v: event.deployment_status },
    { k: "deploying_timestamp", v: event.deploying_timestamp ? formatDateTimeFull(event.deploying_timestamp) : undefined },
    { k: "neg_risk_market_id", v: event.neg_risk_market_id ?? undefined, mono: true },
    { k: "parent_event_id", v: event.parent_event_id != null ? String(event.parent_event_id) : undefined },
    { k: "series_id", v: event.series_id != null ? String(event.series_id) : undefined },
    { k: "metadata_type", v: event.metadata_type ?? undefined },
    { k: "comment_count", v: String(event.comment_count) },
    { k: "created_at", v: formatDateTimeFull(event.created_at) },
    { k: "updated_at", v: formatDateTimeFull(event.updated_at) },
  ];
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          Event details
        </h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
          {rows
            .filter((r) => r.v !== undefined && r.v !== null && r.v !== "")
            .map((r) => (
              <Fact key={r.k} k={r.k} v={r.v as string} mono={r.mono} />
            ))}
        </dl>

        <div className="flex flex-wrap gap-1.5">
          <FlagBadge label="active" value={event.active} />
          <FlagBadge label="closed" value={event.closed} />
          <FlagBadge label="archived" value={event.archived} />
          <FlagBadge label="restricted" value={event.restricted} />
          <FlagBadge label="paused" value={event.paused} />
          <FlagBadge label="neg_risk" value={event.neg_risk} />
        </div>

        {event.tags && event.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
              tags
            </span>
            {event.tags.map((t) => (
              <Badge key={t.id} tone="neutral">{t.label || t.slug}</Badge>
            ))}
          </div>
        ) : null}

        {hasNonEmptyString(event.description) ? (
          <details className="rounded-md border border-border bg-foreground/[0.02]">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              Description
            </summary>
            <div className="px-3 py-3 border-t border-border text-sm whitespace-pre-wrap">
              {event.description}
            </div>
          </details>
        ) : null}

        {hasNonEmptyMetadata(event.metadata) ? (
          <details className="rounded-md border border-border bg-foreground/[0.02]">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
              metadata
            </summary>
            <pre className="px-3 py-3 border-t border-border text-[11px] font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Per-market card — the operator's primary working surface.
// ---------------------------------------------------------------------------

function MarketCard({
  row,
  source,
  verdict,
  outcome,
  cryptoEventId,
}: {
  row: MarketRow;
  source: PlanSource;
  verdict?: MarketStatusVerdict;
  outcome?: MarketOutcome;
  cryptoEventId?: number;
}) {
  const m = row.market;
  const dpm = verdict?.market;
  const params = new URLSearchParams({
    source,
    plan_id: row.planExternalId,
    pos: String(row.position),
  });
  if (cryptoEventId !== undefined) params.set("crypto_event_id", String(cryptoEventId));
  const href = m.external_id
    ? `/markets/${encodeURIComponent(m.external_id)}?${params.toString()}`
    : null;

  return (
    <li>
      <Card>
        <CardHeader className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span className="text-xs text-foreground-muted font-mono shrink-0 mt-0.5">
              #{row.position + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h3 className="text-sm font-medium leading-tight">
                {m.question || (
                  <span className="text-foreground-muted italic">(untitled)</span>
                )}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const derived = derive({
                    source: "manual",
                    planMarket: m,
                    verdict: verdict ?? undefined,
                  });
                  return (
                    <>
                      <LifecycleStepper lifecycle={derived.lifecycle} variant="compact" />
                      <ResultChip result={derived.result} />
                    </>
                  );
                })()}
                {m.parent_market_id ? (
                  <Badge tone="neutral">recreated</Badge>
                ) : null}
              </div>
              <MarketOutcomeInline outcome={outcome ?? null} />
            </div>
          </div>
          {href ? (
            <Link href={href} className={buttonVariants.ghost} title="Open the full market page">
              Open →
            </Link>
          ) : (
            <span className="text-[11px] text-foreground-muted italic">
              not deployed yet
            </span>
          )}
        </CardHeader>

        <CardBody className="space-y-3">
          {/* Inline actions — keeps the operator in flow. */}
          {m.external_id ? (
            <MarketActionsPanel
              source={source}
              dpmMarket={dpm}
              verdictStatus={verdict?.status}
              planMarket={m}
              planExternalId={row.planExternalId}
              marketExternalId={m.external_id}
            />
          ) : (
            <p className="text-xs text-foreground-muted">
              Market hasn’t reached on-chain stage yet. Plan-phase actions
              available once it’s in flight.
            </p>
          )}

          {/* Expandable details — for deep inspection without leaving the page. */}
          {m.external_id ? (
            <details className="rounded-md border border-border bg-foreground/[0.02] text-xs">
              <summary className="cursor-pointer list-none px-3 py-2 font-semibold uppercase tracking-wider text-foreground-muted flex items-center gap-2">
                <span className="text-foreground-muted/70">▸</span>
                Details
                <span className="text-foreground-muted/60 normal-case font-normal ml-auto">
                  external_id · condition · workflow · payload
                </span>
              </summary>
              <div className="px-3 py-3 border-t border-border space-y-2 font-mono break-all">
                <KV k="external_id" v={m.external_id} />
                {dpm?.condition_id ? <KV k="condition_id" v={dpm.condition_id} /> : null}
                {dpm?.question_id ? <KV k="question_id" v={dpm.question_id} /> : null}
                {dpm?.slug ? <KV k="slug" v={dpm.slug} /> : null}
                {dpm?.uma_bond ? <KV k="uma_bond" v={dpm.uma_bond} /> : null}
                {dpm?.uma_reward ? <KV k="uma_reward" v={dpm.uma_reward} /> : null}
                {verdict?.workflow_id ? <KV k="workflow_id" v={verdict.workflow_id} /> : null}
                {verdict?.workflow?.status ? (
                  <KV k="workflow_status" v={verdict.workflow.status} />
                ) : null}
                {verdict?.workflow?.pending_activity ? (
                  <KV
                    k="pending_activity"
                    v={`${verdict.workflow.pending_activity.activity_type} · attempt ${verdict.workflow.pending_activity.attempt} · ${verdict.workflow.pending_activity.state}`}
                  />
                ) : null}
                {m.error || verdict?.error ? (
                  <div>
                    <span className="text-foreground-muted">error: </span>
                    <span className="text-danger">{m.error ?? verdict?.error}</span>
                  </div>
                ) : null}
                {m.request_payload ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-foreground-muted font-sans">
                      request_payload
                    </summary>
                    <pre className="mt-1 text-[10px] whitespace-pre-wrap break-all">
                      {JSON.stringify(m.request_payload, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </details>
          ) : null}
        </CardBody>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-foreground-muted">
        {k}
      </dt>
      <dd className={`text-foreground ${mono ? "font-mono break-all" : ""}`}>
        {v}
      </dd>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-foreground-muted font-sans">{k}: </span>
      <span>{v}</span>
    </div>
  );
}

function FlagBadge({ label, value }: { label: string; value?: boolean | null }) {
  if (value === undefined || value === null) return null;
  return <Badge tone={value ? "success" : "neutral"}>{label}: {String(value)}</Badge>;
}

function hasNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function hasNonEmptyMetadata(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  return Object.keys(v as Record<string, unknown>).length > 0;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function sourceTone(s: PlanSource): Tone {
  return s === "sport" ? "info" : s === "crypto" ? "warning" : "neutral";
}

function planTone(status: DeployPlan["status"]): Tone {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "paused":
      return "warning";
    case "running":
      return "info";
    default:
      return "neutral";
  }
}

// Cap the per-source task scan so an org with hundreds of crypto/sport tasks
// doesn't pay an unbounded cost on each event page load. 10 covers every
// realistic deployment we've seen; tune down if the page feels slow.
const TASK_SCAN_LIMIT = 10;

async function findParentSportEvent(
  externalId: string,
): Promise<SportEvent | undefined> {
  let tasks;
  try {
    tasks = await sports.listTasks();
  } catch {
    return undefined;
  }
  for (const t of tasks.slice(0, TASK_SCAN_LIMIT)) {
    try {
      const events = await sports.listEvents(t.id);
      const found = events.find((ev) => ev.event_external_id === externalId);
      if (found) {
        try {
          return await sports.getEvent(found.id);
        } catch {
          return found;
        }
      }
    } catch {
      // skip task
    }
  }
  return undefined;
}

async function findParentCryptoEvent(
  externalId: string,
): Promise<CryptoEvent | undefined> {
  let tasks;
  try {
    tasks = (await cryptoApi.listTasks()).data;
  } catch {
    return undefined;
  }
  for (const t of tasks.slice(0, TASK_SCAN_LIMIT)) {
    try {
      const events = await cryptoApi.listCryptoEvents(t.id);
      const found = events.find((ev) => ev.event_external_id === externalId);
      if (found) {
        try {
          return await cryptoApi.getCryptoEvent(found.id);
        } catch {
          return found;
        }
      }
    } catch {
      // skip task
    }
  }
  return undefined;
}

function tonalize(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("deployed") || s.includes("registered") || s.includes("resolved") || s.includes("succeed")) return "success";
  if (s.includes("fail") || s.includes("cancel") || s.includes("refund") || s.includes("dispute")) return "danger";
  if (s.includes("wait") || s.includes("pending") || s.includes("propos") || s.includes("paused")) return "warning";
  if (s.includes("running") || s.includes("submit") || s.includes("resolving") || s.includes("created") || s.includes("deploying") || s.includes("initializing")) return "info";
  return "neutral";
}
