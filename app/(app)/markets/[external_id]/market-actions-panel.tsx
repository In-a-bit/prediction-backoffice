"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Badge, ErrorMessage, buttonVariants } from "@/components/ui";
import {
  ACTION_META,
  getAvailableActions,
  type MarketActionKey,
} from "@/lib/market-actions";
import type { PlanSource } from "@/lib/source-from-plan";
import type {
  DeployPlanMarket,
  DpmMarket,
  ManualMarketLocalStatus,
  MarketStatus,
  SportMarketStatus,
} from "@/lib/types";

// Canonical UMA price encodings. proposed_price is a wei-encoded integer the
// adapter passes through to the Optimistic Oracle.
const UMA_PRICE_OPTIONS: { label: string; value: string }[] = [
  { label: "NO (0)", value: "0" },
  { label: "YES (1e18)", value: "1000000000000000000" },
  { label: "UNKNOWN (P50)", value: "500000000000000000" },
];

type Ctx = {
  source: PlanSource;
  dpmMarket?: DpmMarket;
  verdictStatus?: MarketStatus;
  planMarket?: DeployPlanMarket;
  planExternalId?: string;
  sportMarketId?: number;
  sportLocalStatus?: SportMarketStatus;
  manualMarketId?: number;
  manualLocalStatus?: ManualMarketLocalStatus;
  marketExternalId: string;
};

// MarketActionsPanel renders only the actions relevant to the market's state.
// Used by both the unified /markets/[external_id] page and inline per-market
// on the event detail page. Visibility comes from lib/market-actions.
export function MarketActionsPanel(props: Ctx) {
  const actions = getAvailableActions(props);
  const [openForm, setOpenForm] = useState<MarketActionKey | null>(null);

  if (actions.length === 0) {
    return (
      <p className="text-xs text-foreground-muted">
        No actions available for this market in its current state.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((key) => {
          const meta = ACTION_META[key];
          const buttonClass = classFor(meta.tone);
          if (ACTIONS_WITH_FORM.has(key)) {
            const isOpen = openForm === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpenForm(isOpen ? null : key)}
                className={buttonClass}
                title={meta.title}
              >
                {isOpen ? "× Cancel" : meta.label}
              </button>
            );
          }
          return (
            <InlineAction
              key={key}
              actionKey={key}
              ctx={props}
              buttonClass={buttonClass}
            />
          );
        })}
      </div>

      {openForm ? (
        <ActionForm
          actionKey={openForm}
          ctx={props}
          onClose={() => setOpenForm(null)}
        />
      ) : null}
    </div>
  );
}

function classFor(tone: "primary" | "secondary" | "ghost" | "danger"): string {
  return tone === "primary"
    ? buttonVariants.primary
    : tone === "secondary"
      ? buttonVariants.secondary
      : tone === "danger"
        ? buttonVariants.danger
        : buttonVariants.ghost;
}

const ACTIONS_WITH_FORM = new Set<MarketActionKey>([
  "uma-propose",
  "uma-resolve-manually",
  "ctf-oracle-report-payouts",
]);

// One-click actions — fire immediately with no parameters.
function InlineAction({
  actionKey,
  ctx,
  buttonClass,
}: {
  actionKey: MarketActionKey;
  ctx: Ctx;
  buttonClass: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const meta = ACTION_META[actionKey];

  function fire() {
    setError(null);
    setOk(null);
    const path = pathFor(actionKey, ctx);
    if (!path) {
      setError(`missing context for ${actionKey}`);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(path, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error ?? `request failed with ${res.status}`,
          );
        }
        const wf = (data as { workflow_id?: string }).workflow_id;
        setOk(wf ? `workflow ${wf.slice(0, 8)}…` : "submitted");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={fire}
        disabled={isPending}
        className={buttonClass}
        title={meta.title}
      >
        {isPending ? `${meta.label}…` : meta.label}
      </button>
      {error ? (
        <span className="text-[11px] text-danger" title={error}>
          {error.length > 50 ? error.slice(0, 50) + "…" : error}
        </span>
      ) : null}
      {ok ? <span className="text-[11px] text-success">{ok}</span> : null}
    </span>
  );
}

// Multi-step actions render a popover form below the button.
function ActionForm({
  actionKey,
  ctx,
  onClose,
}: {
  actionKey: MarketActionKey;
  ctx: Ctx;
  onClose: () => void;
}) {
  switch (actionKey) {
    case "uma-propose":
      return <UmaProposeForm ctx={ctx} onClose={onClose} />;
    case "uma-resolve-manually":
      return <PayoutsForm ctx={ctx} onClose={onClose} kind="uma-manual" />;
    case "ctf-oracle-report-payouts":
      return <PayoutsForm ctx={ctx} onClose={onClose} kind="ctf-oracle" />;
    default:
      return null;
  }
}

function FormCard({ title, tone, children }: { title: string; tone: "neutral" | "danger" | "success" | "warning"; children: ReactNode }) {
  const toneClass =
    tone === "danger"
      ? "border-danger/30 bg-danger/5"
      : tone === "success"
        ? "border-success/30 bg-success/5"
        : tone === "warning"
          ? "border-warning/30 bg-warning/5"
          : "border-border bg-foreground/[0.02]";
  return (
    <div className={`rounded-lg border ${toneClass} p-3 space-y-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function UmaProposeForm({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const router = useRouter();
  const isSport = ctx.sportMarketId !== undefined;
  const isManualWithBackofficeId = ctx.manualMarketId !== undefined;
  const usesWorkflow = isSport || isManualWithBackofficeId;
  const [proposer, setProposer] = useState("");
  const [price, setPrice] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!price) {
      setError("price is required");
      return;
    }
    if (!usesWorkflow && !proposer) {
      setError("proposer and price are both required");
      return;
    }
    startTransition(async () => {
      try {
        // Sport / manual-with-backoffice-id: start the SportsMarketResolutionWorkflow
        // which owns local_status transitions. Plain manual markets: call DPM directly.
        const url = isSport
          ? `/api/sports/markets/${ctx.sportMarketId}/trigger-resolution`
          : isManualWithBackofficeId
            ? `/api/manual/backoffice-markets/${ctx.manualMarketId}/trigger-resolution`
            : `/api/dpm/markets/${encodeURIComponent(ctx.marketExternalId)}/uma/propose`;
        const body = usesWorkflow
          ? JSON.stringify({ proposed_price: price })
          : JSON.stringify({ proposer_address: proposer, proposed_price: price });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { error?: string }).error ?? `request failed with ${res.status}`);
        }
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <FormCard title="UMA · Propose" tone="neutral">
      {!usesWorkflow && (
        <label className="flex flex-col gap-1 text-[11px]">
          Proposer address <span className="text-danger">*</span>
          <input
            value={proposer}
            onChange={(e) => setProposer(e.target.value.trim())}
            placeholder="0x…"
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-mono"
          />
        </label>
      )}
      {usesWorkflow && (
        <p className="text-[11px] text-foreground-muted">
          Starts the full propose → liveness → resolve workflow. The proposer address is managed by the system.
        </p>
      )}
      <label className="flex flex-col gap-1 text-[11px]">
        Proposed price <span className="text-danger">*</span>
        <select
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
        >
          <option value="">Select…</option>
          {UMA_PRICE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonVariants.ghost}>
          Close
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || (!usesWorkflow && !proposer) || !price}
          className={buttonVariants.primary}
        >
          {isPending ? "Submitting…" : "Submit"}
        </button>
      </div>
    </FormCard>
  );
}

function PayoutsForm({
  ctx,
  onClose,
  kind,
}: {
  ctx: Ctx;
  onClose: () => void;
  kind: "uma-manual" | "ctf-oracle";
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"yes" | "no" | "split">("yes");
  const [confirm, setConfirm] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const needsConfirm = kind === "uma-manual";
  const ready =
    !!outcome && (!needsConfirm || confirm.trim().toUpperCase() === "RESOLVE");

  function submit() {
    setError(null);
    // CTF reportPayouts uses a pure ratio: [1,0]=YES wins, [0,1]=NO wins, [1,1]=50/50.
    // The denominator is the sum, so each numerator/denominator = 100%, 0%, or 50%.
    // Absolute values don't matter — only the ratio does.
    const payouts =
      outcome === "yes"
        ? ["1", "0"]
        : outcome === "no"
          ? ["0", "1"]
          : ["1", "1"]; // 50/50 refund
    const path =
      kind === "uma-manual"
        ? `/api/dpm/markets/${encodeURIComponent(ctx.marketExternalId)}/uma/resolve-manually`
        : `/api/dpm/markets/${encodeURIComponent(ctx.marketExternalId)}/ctf-oracle/report-payouts`;
    startTransition(async () => {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payouts }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { error?: string }).error ?? `request failed with ${res.status}`);
        }
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <FormCard
      title={kind === "uma-manual" ? "UMA · Manual resolve" : "CtfOracle · Propose price (report payouts)"}
      tone={kind === "uma-manual" ? "danger" : "success"}
    >
      <fieldset className="flex flex-col gap-1.5 text-[11px]">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`outcome-${kind}`}
            checked={outcome === "yes"}
            onChange={() => setOutcome("yes")}
          />
          YES wins
          <span className="text-foreground-muted">payouts [1, 0]</span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`outcome-${kind}`}
            checked={outcome === "no"}
            onChange={() => setOutcome("no")}
          />
          NO wins
          <span className="text-foreground-muted">payouts [0, 1]</span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`outcome-${kind}`}
            checked={outcome === "split"}
            onChange={() => setOutcome("split")}
          />
          50/50 refund
          <span className="text-foreground-muted">payouts [1, 1]</span>
        </label>
      </fieldset>
      {needsConfirm ? (
        <label className="flex flex-col gap-1 text-[11px]">
          Type <strong>RESOLVE</strong> to confirm
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-mono"
          />
        </label>
      ) : null}
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonVariants.ghost}>
          Close
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!ready || isPending}
          className={kind === "uma-manual" ? buttonVariants.danger : buttonVariants.primary}
        >
          {isPending ? "Submitting…" : "Submit"}
        </button>
      </div>
    </FormCard>
  );
}

function pathFor(key: MarketActionKey, ctx: Ctx): string | null {
  switch (key) {
    case "retry":
    case "recreate":
      if (!ctx.planExternalId || !ctx.planMarket) return null;
      return `/api/manual/deploy-plans/${encodeURIComponent(ctx.planExternalId)}/markets/${ctx.planMarket.position}/${key}`;
    case "manual-watch-dispute":
      if (ctx.manualMarketId === undefined) return null;
      return `/api/manual/backoffice-markets/${ctx.manualMarketId}/uma/watch-dispute`;
    case "uma-resolve":
      return `/api/dpm/markets/${encodeURIComponent(ctx.marketExternalId)}/uma/resolve`;
    case "uma-reset":
      return `/api/dpm/markets/${encodeURIComponent(ctx.marketExternalId)}/uma/reset`;
    case "market-unpause":
      return `/api/dpm/markets/${encodeURIComponent(ctx.marketExternalId)}/unpause`;
    case "market-activate":
      return `/api/dpm/markets/${encodeURIComponent(ctx.marketExternalId)}/activate`;
    case "uma-recover-funds":
      if (ctx.sportMarketId !== undefined) {
        return `/api/sports/markets/${ctx.sportMarketId}/recover-funds`;
      }
      if (ctx.manualMarketId !== undefined) {
        return `/api/manual/backoffice-markets/${ctx.manualMarketId}/recover-funds`;
      }
      return null;
    case "uma-propose":
    case "uma-resolve-manually":
    case "ctf-oracle-report-payouts":
      // Multi-step — handled by ActionForm.
      return null;
  }
}

// Small inline status pill used by callers that want to show whether actions
// can fire at all (e.g. plan-phase blocked).
export function ActionableBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge tone="info">
      {count} action{count === 1 ? "" : "s"} available
    </Badge>
  );
}
