"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

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
  ExternalProposalDecision,
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
  externalProposalDecision?: ExternalProposalDecision;
  marketExternalId: string;
};

// MarketActionsPanel renders only the actions relevant to the market's state.
// Used by both the unified /markets/[external_id] page and inline per-market
// on the event detail page. Visibility comes from lib/market-actions.
export function MarketActionsPanel(props: Ctx) {
  const actions = getAvailableActions(props);
  const [openForm, setOpenForm] = useState<MarketActionKey | null>(null);
  // A submit anywhere in the panel (an inline action or the open form) greys
  // out every action button, so a slow accept can't be double-fired and the
  // Accept/Dispute pair reads as a single busy control.
  const [busy, setBusy] = useState(false);

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
                disabled={busy}
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
              disabled={busy}
              onBusyChange={setBusy}
            />
          );
        })}
      </div>

      {openForm ? (
        <ActionForm
          actionKey={openForm}
          ctx={props}
          onClose={() => setOpenForm(null)}
          onBusyChange={setBusy}
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
  // Disputing spends a bond and resets or escalates the question on-chain, so
  // it gets a confirmation step. Accepting is reversible until dispute_by and
  // fires inline.
  "uma-dispute-external-proposal",
]);

// One-click actions — fire immediately with no parameters.
function InlineAction({
  actionKey,
  ctx,
  buttonClass,
  disabled,
  onBusyChange,
}: {
  actionKey: MarketActionKey;
  ctx: Ctx;
  buttonClass: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const meta = ACTION_META[actionKey];

  // isPending stays true until the router.refresh() started below finishes its
  // server round-trip, so this reports "still updating" for the whole wait.
  useEffect(() => {
    onBusyChange?.(isPending);
  }, [isPending, onBusyChange]);

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
        disabled={isPending || disabled}
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
  onBusyChange,
}: {
  actionKey: MarketActionKey;
  ctx: Ctx;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  switch (actionKey) {
    case "uma-propose":
      return <UmaProposeForm ctx={ctx} onClose={onClose} onBusyChange={onBusyChange} />;
    case "uma-resolve-manually":
      return <PayoutsForm ctx={ctx} onClose={onClose} kind="uma-manual" onBusyChange={onBusyChange} />;
    case "ctf-oracle-report-payouts":
      return <PayoutsForm ctx={ctx} onClose={onClose} kind="ctf-oracle" onBusyChange={onBusyChange} />;
    case "uma-dispute-external-proposal":
      return <DisputeExternalProposalForm ctx={ctx} onClose={onClose} onBusyChange={onBusyChange} />;
    default:
      return null;
  }
}

// Shared "submitted, waiting for the server refresh" plumbing for the popover
// forms. Once a POST succeeds the form stays mounted showing `busyLabel` while
// router.refresh() re-runs the page's server fetches, then closes itself. This
// is what turns a silent dispute into visible feedback: the button greys out
// and the row updates in place instead of only after a manual reload.
function useFormSubmit(onClose: () => void, onBusyChange?: (busy: boolean) => void) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onBusyChange?.(isPending);
  }, [isPending, onBusyChange]);

  // Close only after the refresh settles (submitted && !isPending), so the
  // operator sees the "updating" state for the whole round-trip.
  useEffect(() => {
    if (submitted && !isPending) onClose();
  }, [submitted, isPending, onClose]);

  function run(request: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await request();
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return { isPending, submitted, error, setError, run };
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

function UmaProposeForm({
  ctx,
  onClose,
  onBusyChange,
}: {
  ctx: Ctx;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const isSport = ctx.sportMarketId !== undefined;
  const isManualWithBackofficeId = ctx.manualMarketId !== undefined;
  const usesWorkflow = isSport || isManualWithBackofficeId;
  const [proposer, setProposer] = useState("");
  const [price, setPrice] = useState("");
  const { isPending, submitted, error, setError, run } = useFormSubmit(onClose, onBusyChange);

  function submit() {
    if (!price) {
      setError("price is required");
      return;
    }
    if (!usesWorkflow && !proposer) {
      setError("proposer and price are both required");
      return;
    }
    run(async () => {
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
      <UpdatingNote show={submitted}>Proposal submitted — updating…</UpdatingNote>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={isPending} className={buttonVariants.ghost}>
          Close
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || submitted || (!usesWorkflow && !proposer) || !price}
          className={buttonVariants.primary}
        >
          {submitted ? "Updating…" : isPending ? "Submitting…" : "Submit"}
        </button>
      </div>
    </FormCard>
  );
}

// The success line the popover forms show after a POST lands, while the page's
// server components re-fetch. Kept mounted until useFormSubmit closes the form.
function UpdatingNote({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <p className="text-[11px] text-success">{children}</p>;
}

function DisputeExternalProposalForm({
  ctx,
  onClose,
  onBusyChange,
}: {
  ctx: Ctx;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const { isPending, submitted, error, run } = useFormSubmit(onClose, onBusyChange);

  const ready = confirm.trim().toUpperCase() === "DISPUTE";

  function submit() {
    run(async () => {
      const res = await fetch(
        `/api/manual/backoffice-markets/${ctx.manualMarketId}/uma/dispute-external-proposal`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `request failed with ${res.status}`);
      }
      router.refresh();
    });
  }

  return (
    <FormCard title="UMA · Dispute external proposal" tone="danger">
      <p className="text-[11px] text-foreground-muted leading-snug">
        Broadcasts <code>disputePriceFor</code> from the UMA_ADMIN wallet and
        posts the dispute bond. The first dispute resets the question so a new
        price can be proposed; a second sends it to the UMA DVM for a vote.
      </p>
      <label className="flex flex-col gap-1 text-[11px]">
        Type <strong>DISPUTE</strong> to confirm
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-mono"
        />
      </label>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      <UpdatingNote show={submitted}>Dispute sent — updating…</UpdatingNote>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={isPending} className={buttonVariants.ghost}>
          Close
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!ready || isPending || submitted}
          className={buttonVariants.danger}
        >
          {submitted ? "Updating…" : isPending ? "Disputing…" : "Dispute"}
        </button>
      </div>
    </FormCard>
  );
}

function PayoutsForm({
  ctx,
  onClose,
  kind,
  onBusyChange,
}: {
  ctx: Ctx;
  onClose: () => void;
  kind: "uma-manual" | "ctf-oracle";
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"yes" | "no" | "split">("yes");
  const [confirm, setConfirm] = useState("");
  const { isPending, submitted, error, run } = useFormSubmit(onClose, onBusyChange);

  const needsConfirm = kind === "uma-manual";
  const ready =
    !!outcome && (!needsConfirm || confirm.trim().toUpperCase() === "RESOLVE");

  function submit() {
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
    run(async () => {
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
      <UpdatingNote show={submitted}>Payouts reported — updating…</UpdatingNote>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={isPending} className={buttonVariants.ghost}>
          Close
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!ready || isPending || submitted}
          className={kind === "uma-manual" ? buttonVariants.danger : buttonVariants.primary}
        >
          {submitted ? "Updating…" : isPending ? "Submitting…" : "Submit"}
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
    case "uma-accept-external-proposal":
      if (ctx.manualMarketId === undefined) return null;
      return `/api/manual/backoffice-markets/${ctx.manualMarketId}/uma/accept-external-proposal`;
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
    case "uma-dispute-external-proposal":
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
