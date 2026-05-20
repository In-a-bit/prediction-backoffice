import Link from "next/link";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  InfoMessage,
  PageHeader,
} from "@/components/ui";
import { SportOutcomeBlock, CryptoOutcomeBlock } from "@/components/event-outcome";
import { LifecycleStepper, ResultChip } from "@/components/market-lifecycle";
import { manual, sports, crypto as cryptoApi } from "@/lib/api";
import { formatDateTimeFull } from "@/lib/format";
import { derive } from "@/lib/market-lifecycle";
import { inferSourceFromPlan, type PlanSource } from "@/lib/source-from-plan";
import type {
  CryptoEvent,
  CryptoMarket,
  DeployPlan,
  DeployPlanMarket,
  MarketStatusVerdict,
  SportEvent,
  SportMarket,
} from "@/lib/types";

import { MarketActionsPanel } from "./market-actions-panel";

export const dynamic = "force-dynamic";

type SearchParams = {
  source?: string;
  plan_id?: string;
  pos?: string;
  sport_market_id?: string;
  crypto_event_id?: string;
};

function parseSource(value: string | undefined): PlanSource | undefined {
  if (value === "manual" || value === "crypto" || value === "sport") return value;
  return undefined;
}

export default async function MarketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ external_id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { external_id } = await params;
  const sp = await searchParams;
  const sourceHint = parseSource(sp.source);
  const planId = sp.plan_id;
  const pos = sp.pos !== undefined ? Number.parseInt(sp.pos, 10) : undefined;
  const sportMarketId =
    sp.sport_market_id !== undefined
      ? Number.parseInt(sp.sport_market_id, 10)
      : undefined;
  const cryptoEventId =
    sp.crypto_event_id !== undefined
      ? Number.parseInt(sp.crypto_event_id, 10)
      : undefined;

  let verdict: MarketStatusVerdict | null = null;
  let plan: DeployPlan | null = null;
  let planMarket: DeployPlanMarket | undefined;
  let sportEvent: SportEvent | undefined;
  let sportMarket: SportMarket | undefined;
  let cryptoEvent: CryptoEvent | undefined;
  let cryptoMarketRecord: import("@/lib/types").CryptoMarket | undefined;
  let fetchError: string | null = null;

  // Fan out every independent fetch we know we need. Each catch-block keeps
  // the others alive; per-source rendering degrades gracefully.
  const wantPlan = Boolean(planId && pos !== undefined && Number.isFinite(pos));
  const wantSport = sourceHint === "sport" && sportMarketId !== undefined;
  const wantCrypto = sourceHint === "crypto" && cryptoEventId !== undefined;

  const [verdictRes, planRes, sportStatusRes, cryptoEventRes] = await Promise.all([
    manual.getMarketStatus(external_id).catch((err) => {
      fetchError = err instanceof Error ? err.message : String(err);
      return null;
    }),
    wantPlan
      ? manual.getDeployPlan(planId as string).catch(() => null)
      : Promise.resolve(null),
    wantSport
      ? sports.getMarketStatus(sportMarketId as number).catch(() => null)
      : Promise.resolve(null),
    wantCrypto
      ? cryptoApi.getCryptoEvent(cryptoEventId as number).catch(() => null)
      : Promise.resolve(null),
  ]);

  verdict = verdictRes;
  if (planRes) {
    plan = planRes;
    planMarket = planRes.markets.find((m) => m.position === pos);
  }
  if (cryptoEventRes) {
    cryptoEvent = cryptoEventRes;
    cryptoMarketRecord = cryptoEventRes.markets?.find(
      (m) => m.market_external_id === external_id,
    );
  }
  if (sportStatusRes) {
    const eventId = extractParentEventId(sportStatusRes);
    if (eventId !== undefined) {
      try {
        sportEvent = await sports.getEvent(eventId);
        sportMarket = sportEvent.markets?.find((m) => m.id === sportMarketId);
      } catch {
        // Soft-fail.
      }
    }
  }

  const source: PlanSource =
    sourceHint ?? (plan ? inferSourceFromPlan(plan) : "manual");
  const eventExternalId = plan?.event_external_id;
  const m = verdict?.market;

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6">
      <Breadcrumbs source={source} planId={planId} eventExternalId={eventExternalId} />

      <PageHeader
        title={m?.question ?? planMarket?.question ?? "Market"}
        description="dpm-api market detail — full lifecycle (deploy → propose → resolve) and the actions to drive it."
      />

      {fetchError ? <ErrorMessage>{fetchError}</ErrorMessage> : null}

      <LifecycleHeader
        source={source}
        verdict={verdict}
        planMarket={planMarket}
        sportMarket={sportMarket}
        sportEvent={sportEvent}
        cryptoMarket={cryptoMarketRecord}
        cryptoEvent={cryptoEvent}
      />

      {/* Two-column layout on wide screens: info on the left, actions on the right. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
                Key facts
              </h2>
            </CardHeader>
            <CardBody>
              <KeyFactsGrid
                external_id={external_id}
                m={m}
                planMarket={planMarket}
                planExternalId={plan?.external_id}
              />
            </CardBody>
          </Card>

          {verdict?.workflow_id || verdict?.workflow ? (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
                  Deploy workflow
                </h2>
              </CardHeader>
              <CardBody className="text-xs space-y-1.5 font-mono break-all">
                {verdict.workflow_id ? (
                  <KV k="workflow_id" v={verdict.workflow_id} />
                ) : null}
                {verdict.workflow?.status ? (
                  <KV k="status" v={verdict.workflow.status} />
                ) : null}
                {verdict.workflow?.history_length !== undefined ? (
                  <KV k="history_length" v={String(verdict.workflow.history_length)} />
                ) : null}
                {verdict.workflow?.pending_activity ? (
                  <KV
                    k="pending"
                    v={`${verdict.workflow.pending_activity.activity_type} · attempt ${verdict.workflow.pending_activity.attempt} · ${verdict.workflow.pending_activity.state}`}
                  />
                ) : null}
                {verdict.workflow?.error ? (
                  <KV k="error" v={verdict.workflow.error} tone="danger" />
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          {planMarket?.error || verdict?.error ? (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
                  Last error
                </h2>
              </CardHeader>
              <CardBody>
                <ErrorMessage>{planMarket?.error ?? verdict?.error}</ErrorMessage>
              </CardBody>
            </Card>
          ) : null}

          {planMarket?.request_payload ? (
            <details className="rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Request payload
              </summary>
              <pre className="px-5 py-4 border-t border-border text-[11px] font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(planMarket.request_payload, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>

        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
                Actions
              </h2>
            </CardHeader>
            <CardBody>
              {!source ? (
                <InfoMessage>
                  No source context. Open this page from a plan, the event
                  page, or /events to see source-specific actions.
                </InfoMessage>
              ) : (
                <MarketActionsPanel
                  source={source}
                  dpmMarket={m ?? undefined}
                  verdictStatus={verdict?.status}
                  planMarket={planMarket}
                  planExternalId={plan?.external_id}
                  sportMarketId={sportMarketId}
                  sportLocalStatus={sportMarket?.local_status}
                  marketExternalId={external_id}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Breadcrumbs({
  source,
  planId,
  eventExternalId,
}: {
  source: PlanSource;
  planId?: string;
  eventExternalId?: string;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
      <Link href="/markets" className="hover:text-foreground">
        Markets
      </Link>
      <span>›</span>
      <Link href={`/markets?source=${source}`} className="hover:text-foreground">
        {source}
      </Link>
      {eventExternalId ? (
        <>
          <span>›</span>
          <Link
            href={`/events/${encodeURIComponent(eventExternalId)}`}
            className="hover:text-foreground"
          >
            event
          </Link>
        </>
      ) : null}
      {planId ? (
        <>
          <span>›</span>
          <Link
            href={`/deploy-plans/${encodeURIComponent(planId)}`}
            className="hover:text-foreground"
          >
            plan
          </Link>
        </>
      ) : null}
      <span>›</span>
      <span className="text-foreground">market</span>
    </nav>
  );
}

function LifecycleHeader({
  source,
  verdict,
  planMarket,
  sportMarket,
  sportEvent,
  cryptoMarket,
  cryptoEvent,
}: {
  source: PlanSource;
  verdict: MarketStatusVerdict | null;
  planMarket?: DeployPlanMarket;
  sportMarket?: SportMarket;
  sportEvent?: SportEvent;
  cryptoMarket?: CryptoMarket;
  cryptoEvent?: CryptoEvent;
}) {
  const derived =
    source === "sport" && sportMarket
      ? derive({ source: "sport", sportMarket, sportEvent })
      : source === "crypto" && cryptoMarket
        ? derive({ source: "crypto", cryptoMarket, cryptoEvent })
        : derive({
            source: "manual",
            planMarket,
            verdict: verdict ?? undefined,
          });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
              Source
            </span>
            <Badge tone={source === "sport" ? "info" : source === "crypto" ? "warning" : "neutral"}>
              {source}
            </Badge>
          </div>
          <ResultChip result={derived.result} showReason />
        </div>
        <div className="mt-4">
          <LifecycleStepper lifecycle={derived.lifecycle} variant="full" />
        </div>
      </div>

      {source === "sport" && sportEvent ? (
        <SportOutcomeBlock event={sportEvent} />
      ) : null}
      {source === "crypto" && cryptoEvent ? (
        <CryptoOutcomeBlock event={cryptoEvent} />
      ) : null}
    </div>
  );
}

function KeyFactsGrid({
  external_id,
  m,
  planMarket,
  planExternalId,
}: {
  external_id: string;
  m?: import("@/lib/types").DpmMarket;
  planMarket?: DeployPlanMarket;
  planExternalId?: string;
}) {
  // Three field groups, ordered the way an operator scans a market: identity
  // → trading config → UMA → timestamps. Empty/null fields are filtered out
  // so the grid stays readable on partially-hydrated markets.
  const identity = [
    row("external_id", external_id, true),
    row("dpm_id", m?.id != null ? String(m.id) : undefined),
    row("event_id", m?.event_id != null ? String(m.event_id) : undefined),
    row("slug", m?.slug),
    row("ticker", undefined),
    row("condition_id", m?.condition_id, true),
    row("question_id", m?.question_id, true),
    row("resolution_source", m?.resolution_source),
    row("neg_risk_market_id", m?.neg_risk_market_id, true),
    row("neg_risk_request_id", m?.neg_risk_request_id, true),
    row("submitted_by", m?.submitted_by, true),
    row("resolved_by", m?.resolved_by, true),
  ];

  const trading = [
    row("activation", m?.activation),
    row("order_price_min_tick_size", m?.order_price_min_tick_size, true),
    row(
      "order_min_size",
      m?.order_min_size != null ? String(m.order_min_size) : undefined,
    ),
    row("seconds_delay", m?.seconds_delay, true),
    row("metadata_type", m?.metadata_type),
  ];

  const uma = [
    row("uma_resolution_status", m?.uma_resolution_status),
    row("uma_bond", m?.uma_bond, true),
    row("uma_reward", m?.uma_reward, true),
  ];

  const timing = [
    row("deployment_status", m?.deployment_status),
    row(
      "deploying_timestamp",
      m?.deploying_timestamp ? formatDateTimeFull(m.deploying_timestamp) : undefined,
    ),
    row(
      "start_date",
      m?.start_date ? formatDateTimeFull(m.start_date) : undefined,
    ),
    row("end_date", m?.end_date ? formatDateTimeFull(m.end_date) : undefined),
    row(
      "accepting_orders_at",
      m?.accepting_orders_timestamp
        ? formatDateTimeFull(m.accepting_orders_timestamp)
        : undefined,
    ),
    row(
      "public_accepting_orders_at",
      m?.public_accepting_orders_timestamp
        ? formatDateTimeFull(m.public_accepting_orders_timestamp)
        : undefined,
    ),
    row(
      "created_at",
      m?.created_at ? formatDateTimeFull(m.created_at) : undefined,
    ),
    row(
      "updated_at",
      m?.updated_at ? formatDateTimeFull(m.updated_at) : undefined,
    ),
  ];

  const flags: { label: string; value: boolean | null | undefined }[] = [
    { label: "active", value: m?.active },
    { label: "closed", value: m?.closed },
    { label: "archived", value: m?.archived },
    { label: "restricted", value: m?.restricted },
    { label: "paused", value: m?.paused },
    { label: "flagged", value: m?.flagged },
    { label: "neg_risk", value: m?.neg_risk },
    { label: "neg_risk_other", value: m?.neg_risk_other },
    { label: "accepting_orders", value: m?.accepting_orders },
    { label: "public_accepting_orders", value: m?.public_accepting_orders },
    { label: "funded", value: m?.funded },
    { label: "approved", value: m?.approved },
    { label: "automatically_active", value: m?.automatically_active },
    { label: "clear_book_on_start", value: m?.clear_book_on_start },
    { label: "rfq_enabled", value: m?.rfq_enabled },
  ].filter((f) => f.value !== undefined && f.value !== null);

  return (
    <div className="space-y-5">
      <FieldGroup title="Identity" rows={identity} />
      <FieldGroup title="Trading config" rows={trading} />
      <FieldGroup title="UMA" rows={uma} />
      <FieldGroup title="Timing" rows={timing} />

      {flags.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Flags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <Badge key={f.label} tone={f.value ? "success" : "neutral"}>
                {f.label}: {String(f.value)}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {hasNonEmptyString(m?.description) ? (
        <details className="rounded-md border border-border bg-foreground/[0.02]">
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
            Description
          </summary>
          <div className="px-3 py-3 border-t border-border text-sm whitespace-pre-wrap">
            {m!.description}
          </div>
        </details>
      ) : null}

      {hasNonEmptyMetadata(m?.metadata) ? (
        <details className="rounded-md border border-border bg-foreground/[0.02]">
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
            metadata
          </summary>
          <pre className="px-3 py-3 border-t border-border text-[11px] font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(m!.metadata, null, 2)}
          </pre>
        </details>
      ) : null}

      {planMarket && planExternalId ? (
        <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs">
          <span className="text-foreground-muted">In plan </span>
          <Link
            href={`/deploy-plans/${encodeURIComponent(planExternalId)}`}
            className="underline"
          >
            {planExternalId.slice(0, 8)}…
          </Link>
          <span className="text-foreground-muted"> at position </span>
          <span className="font-mono">#{planMarket.position + 1}</span>
          {planMarket.parent_market_id ? (
            <span className="text-foreground-muted"> (recreated from earlier failure)</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type GridRow = { label: string; value?: string; mono?: boolean };

function row(label: string, value?: string | null, mono?: boolean): GridRow {
  return { label, value: value ?? undefined, mono };
}

function hasNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function hasNonEmptyMetadata(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  return Object.keys(v as Record<string, unknown>).length > 0;
}

function FieldGroup({ title, rows }: { title: string; rows: GridRow[] }) {
  const visible = rows.filter((r) => r.value !== undefined && r.value !== "");
  if (visible.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <h3 className="text-[10px] uppercase tracking-wider text-foreground-muted">
        {title}
      </h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {visible.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5 min-w-0">
            <dt className="text-[10px] uppercase tracking-wider text-foreground-muted">
              {r.label}
            </dt>
            <dd className={`text-foreground ${r.mono ? "font-mono break-all" : ""}`}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: "danger" | "muted" }) {
  return (
    <div>
      <span className="text-foreground-muted">{k}: </span>
      <span className={tone === "danger" ? "text-danger" : ""}>{v}</span>
    </div>
  );
}

function extractParentEventId(raw: Record<string, unknown> | null): number | undefined {
  if (!raw) return undefined;
  // Accept either {sport_event_id:...} or {market:{sport_event_id:...}}
  const direct = (raw as { sport_event_id?: unknown }).sport_event_id;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const nested = (raw as { market?: { sport_event_id?: unknown } }).market
    ?.sport_event_id;
  if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  return undefined;
}
