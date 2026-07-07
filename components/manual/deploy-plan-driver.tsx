"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  buttonVariants,
} from "@/components/ui";
import { inferSourceFromPlan, type PlanSource } from "@/lib/source-from-plan";
import type {
  DeployPlan,
  DeployPlanMarket,
  DeployPlanMarketStatus,
  DeployPlanStatus,
} from "@/lib/types";

const POLL_INTERVAL_MS = 1000;

type Action = "start" | "recreate" | "retry";

// DeployPlanDriver is a thin observer over the backend-driven deploy plan.
// All state lives in Postgres; the UI just polls /deploy-plans/:id and
// surfaces the controls. Closing or reopening the page does nothing to
// execution — the backend runner keeps progressing the queue.
export function DeployPlanDriver({
  planExternalId,
  onCompleted,
}: {
  planExternalId: string;
  onCompleted?: (plan: DeployPlan) => void;
}) {
  const [plan, setPlan] = useState<DeployPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    type: Action;
    pos?: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Track the last seen status so we can fire onCompleted exactly once on the
  // edge from non-completed → completed/failed.
  const lastStatusRef = useRef<DeployPlanStatus | null>(null);
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  });

  // Poll loop: GET /deploy-plans/:id every 1s. The polling closure is stable;
  // setPlan re-renders without restarting the timer.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/manual/deploy-plans/${encodeURIComponent(planExternalId)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setError(`status ${res.status}`);
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        const data = (await res.json()) as DeployPlan;
        setPlan(data);
        setError(null);
        if (
          (data.status === "completed" || data.status === "failed") &&
          lastStatusRef.current !== data.status
        ) {
          onCompletedRef.current?.(data);
        }
        lastStatusRef.current = data.status;
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [planExternalId]);

  // Generic action handler — POSTs to the right endpoint, expects the updated
  // plan back, and patches local state immediately so the UI doesn't lag the
  // ~1s poll cadence.
  const fire = useCallback(
    (action: Action, pos?: number) => {
      setPendingAction({ type: action, pos });
      startTransition(async () => {
        try {
          let path: string;
          switch (action) {
            case "start":
              path = `/api/manual/deploy-plans/${encodeURIComponent(planExternalId)}/start`;
              break;
            case "recreate":
              path = `/api/manual/deploy-plans/${encodeURIComponent(planExternalId)}/markets/${pos}/recreate`;
              break;
            case "retry":
              path = `/api/manual/deploy-plans/${encodeURIComponent(planExternalId)}/markets/${pos}/retry`;
              break;
          }
          const res = await fetch(path, { method: "POST" });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(body.error ?? `request failed with ${res.status}`);
          }
          const data = (await res.json()) as DeployPlan;
          setPlan(data);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setPendingAction(null);
        }
      });
    },
    [planExternalId],
  );

  if (!plan) {
    return (
      <Card>
        <CardBody className="text-sm text-foreground-muted">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : (
            "Loading plan…"
          )}
        </CardBody>
      </Card>
    );
  }

  const allTerminal =
    plan.markets.length > 0 &&
    plan.markets.every(
      (m) => m.status === "deployed" || m.status === "skipped",
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                Deploy plan{" "}
                <PlanStatusBadge status={plan.status} />
              </h2>
              <p className="text-xs text-foreground-muted mt-0.5">
                Backend-driven. State persists across UI/server restarts —
                close this tab and the queue keeps progressing.
              </p>
            </div>
            <div className="flex gap-2">
              {plan.status === "pending" || plan.status === "paused" ? (
                <button
                  type="button"
                  onClick={() => fire("start")}
                  disabled={isPending}
                  className={buttonVariants.primary}
                >
                  {plan.status === "pending" ? "Deploy queue" : "Resume"}
                </button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          {plan.markets.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No markets in the queue.
            </p>
          ) : (
            <ul className="space-y-3">
              {plan.markets.map((m) => (
                <MarketRow
                  key={m.id}
                  market={m}
                  planExternalId={plan.external_id}
                  source={inferSourceFromPlan(plan)}
                  isPending={isPending && pendingAction?.pos === m.position}
                  pendingActionType={pendingAction?.type}
                  onRetry={() => fire("retry", m.position)}
                  onRecreate={() => fire("recreate", m.position)}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p
        className="text-[11px] text-foreground-muted font-mono break-all"
        title="DeployPlan.external_id — plan UUID. DeployPlan.correlation_id — groups every operator_log row for this plan."
      >
        Plan ID: {plan.external_id}
        {plan.correlation_id ? ` · Correlation: ${plan.correlation_id}` : ""}
      </p>
      {allTerminal ? (
        <p className="text-xs text-foreground-muted">
          All markets settled. The plan is{" "}
          <strong>{plan.status}</strong>.
        </p>
      ) : null}
    </div>
  );
}

function MarketRow({
  market,
  planExternalId,
  source,
  isPending,
  pendingActionType,
  onRetry,
  onRecreate,
}: {
  market: DeployPlanMarket;
  planExternalId: string;
  source: PlanSource;
  isPending: boolean;
  pendingActionType?: Action;
  onRetry: () => void;
  onRecreate: () => void;
}) {
  const marketHref = market.external_id
    ? `/markets/${encodeURIComponent(market.external_id)}?source=${source}&plan_id=${encodeURIComponent(planExternalId)}&pos=${market.position}`
    : null;
  return (
    <li className="rounded-lg border border-border bg-foreground/[0.02]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-foreground-muted font-mono shrink-0">
            #{market.position + 1}
          </span>
          <span className="text-sm font-medium truncate">
            {market.question || (
              <span className="text-foreground-muted italic">
                (untitled market)
              </span>
            )}
          </span>
          <MarketStatusBadge status={market.status} />
          {market.parent_market_id ? (
            <span
              className="text-[11px] text-foreground-muted"
              title={`DeployPlanMarket.parent_market_id = ${market.parent_market_id} — this row was created as a recreate of an earlier failed attempt within the same plan.`}
            >
              · recreate
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {marketHref ? (
            <Link
              href={marketHref}
              className={buttonVariants.ghost}
              title="Open the market detail page"
            >
              Open →
            </Link>
          ) : (
            <span
              className="text-[11px] text-foreground-muted italic px-2"
              title="Will appear once the deploy reaches the running stage"
            >
              not deployed yet
            </span>
          )}
          {market.status === "failed" ? (
            <>
              <button
                type="button"
                onClick={onRetry}
                disabled={isPending}
                className={buttonVariants.primary}
                title="Retry this market in place. If the original CreateMarket call never reached dpm-api, re-issues it. If dpm-api has the market with deployment_status=FAILED, asks dpm-api to reset and restart the deploy workflow."
              >
                {isPending && pendingActionType === "retry"
                  ? "Retrying…"
                  : "Retry"}
              </button>
              <button
                type="button"
                onClick={onRecreate}
                disabled={isPending}
                className={buttonVariants.secondary}
                title="Mark this market skipped and append a fresh row at the next queue position. Use when in-place retry isn't appropriate (or you want a clean audit trail)."
              >
                {isPending && pendingActionType === "recreate"
                  ? "Recreating…"
                  : "Recreate"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {market.error ? (
        <div className="px-4 py-2">
          <ErrorMessage>{market.error}</ErrorMessage>
        </div>
      ) : null}

      {market.external_id || market.workflow_id ? (
        <div
          className="px-4 py-2 text-[11px] text-foreground-muted font-mono break-all"
          title="DeployPlanMarket.external_id = dpm-api market UUID returned in the 202 envelope. DeployPlanMarket.workflow_id = Temporal workflow id driving the on-chain deploy."
        >
          {market.external_id ? `Market UUID: ${market.external_id}` : null}
          {market.external_id && market.workflow_id ? " · " : null}
          {market.workflow_id ? `Deploy workflow: ${market.workflow_id}` : null}
        </div>
      ) : null}
    </li>
  );
}

function PlanStatusBadge({ status }: { status: DeployPlanStatus }) {
  switch (status) {
    case "pending":
      return <Badge tone="neutral">pending</Badge>;
    case "running":
      return <Badge tone="info">running</Badge>;
    case "paused":
      return <Badge tone="warning">paused</Badge>;
    case "completed":
      return <Badge tone="success">completed</Badge>;
    case "failed":
      return <Badge tone="danger">failed</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

function MarketStatusBadge({ status }: { status: DeployPlanMarketStatus }) {
  switch (status) {
    case "idle":
      return <Badge tone="neutral">queued</Badge>;
    case "submitting":
      return <Badge tone="info">submitting…</Badge>;
    case "running":
      return <Badge tone="info">running</Badge>;
    case "waiting_for_balance":
      return <Badge tone="warning">waiting for balance</Badge>;
    case "deployed":
      return <Badge tone="success">deployed</Badge>;
    case "failed":
      return <Badge tone="danger">failed</Badge>;
    case "skipped":
      return <Badge tone="neutral">skipped</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}
