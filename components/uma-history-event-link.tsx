"use client";

import { useCallback, useRef, useState } from "react";

import {
  CopyRow,
  KV,
  RawDataToggle,
  RawFieldList,
  Section,
  SideDrawer,
  TimeRow,
  shortHex,
  unixSecondsToDate,
  type RawField,
} from "@/components/side-drawer";
import { Badge } from "@/components/ui";
import { txUrl } from "@/lib/explorer";
import { formatUsdc } from "@/lib/format";
import { umaPriceLabelName, umaPriceLabelTone } from "@/lib/market-lifecycle";
import type {
  UmaHistoryEvent,
  UmaHistoryEventType,
  UmaOraclePriceLabel,
} from "@/lib/types";

// One dot of the market lifecycle timeline, made clickable because we know
// which on-chain transaction produced it (see dpm-api's
// /markets/by-external-id/:id/uma/history). Clicking opens a drawer with that
// step's transaction and event parameters — the same chrome and RAW DATA
// toggle as the question_id drawer next door, except everything here is
// already fetched, so the toggle is a pure display switch with no re-fetch.
export function UmaHistoryEventDot({
  event,
  dotClassName,
}: {
  event: UmaHistoryEvent;
  dotClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Return keyboard focus to the dot on close, rather than dropping it back
  // to <body> — standard dialog-dismissal behavior.
  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const label = `${EVENT_LABELS[event.type]} — view transaction`;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={`${dotClassName} cursor-pointer transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1`}
      />
      {open ? <EventDrawer event={event} onClose={handleClose} /> : null}
    </>
  );
}

const EVENT_LABELS: Record<UmaHistoryEventType, string> = {
  created: "Created",
  proposed: "Proposed",
  disputed: "Disputed",
  reset: "Reset",
  resolved: "Resolved",
};

// The on-chain event each step was decoded from. A "reset" step is always the
// standalone kind — a resolve() the DVM answered "too early", which the
// adapter turned into a QuestionReset (a dispute's own reset is folded into
// the dispute by dpm-api). It is therefore never labelled "Resolved", even
// though the call that produced it was resolve().
const EVENT_TITLES: Record<UmaHistoryEventType, string> = {
  created: "UmaCtfAdapter.QuestionInitialized",
  proposed: "ManagedOptimisticOracleV2.ProposePrice",
  disputed: "ManagedOptimisticOracleV2.DisputePrice",
  reset: "UmaCtfAdapter.QuestionReset",
  resolved: "UmaCtfAdapter.QuestionResolved",
};

const EVENT_TONES: Record<
  UmaHistoryEventType,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  created: "info",
  proposed: "info",
  disputed: "danger",
  reset: "warning",
  resolved: "success",
};

function EventDrawer({
  event,
  onClose,
}: {
  event: UmaHistoryEvent;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(false);

  const header = (
    <>
      <div className="flex items-center gap-2">
        <Badge tone={EVENT_TONES[event.type]}>
          {EVENT_LABELS[event.type].toUpperCase()}
        </Badge>
        <span className="text-xs text-foreground-muted font-mono">
          #{shortHex(event.tx_hash)}
        </span>
      </div>
      <h3 className="mt-1.5 text-sm font-semibold">{EVENT_TITLES[event.type]}</h3>
    </>
  );

  return (
    <SideDrawer
      ariaLabel={`${EVENT_LABELS[event.type]} lifecycle event`}
      header={header}
      onClose={onClose}
    >
      <div className="px-5 py-4 space-y-5 text-sm">
        <RawDataToggle raw={raw} onToggle={() => setRaw((r) => !r)} />
        {raw ? (
          <RawFieldList
            signature={`${EVENT_TITLES[event.type]} — indexed fields`}
            fields={rawFields(event)}
          />
        ) : (
          <>
            <TransactionSection event={event} />
            <EventDetailSection event={event} />
          </>
        )}
      </div>
    </SideDrawer>
  );
}

function TransactionSection({ event }: { event: UmaHistoryEvent }) {
  return (
    <Section title="Transaction">
      <CopyRow label="Tx hash" value={event.tx_hash} />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">Explorer</span>
        <a
          href={txUrl(event.tx_hash)}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline decoration-dotted hover:decoration-solid hover:text-accent transition-colors"
        >
          View on Polygonscan
        </a>
      </div>
      <KV label="Block" value={String(event.block_number)} mono />
      <TimeRow label="Mined" value={parseTimestamp(event.timestamp)} />
    </Section>
  );
}

function EventDetailSection({ event }: { event: UmaHistoryEvent }) {
  switch (event.type) {
    case "created":
      return <CreatedDetail event={event} />;
    case "proposed":
      return <ProposedDetail event={event} />;
    case "disputed":
      return <DisputedDetail event={event} />;
    case "reset":
      return <ResetDetail event={event} />;
    default:
      return <ResolvedDetail event={event} />;
  }
}

function CreatedDetail({ event }: { event: UmaHistoryEvent }) {
  return (
    <>
      <Section title="Question">
        <CopyRow label="Creator" value={event.creator_address} />
        <CopyRow label="Question id" value={event.question_id} />
        <KV label="Reward" value={formatUsdc(event.reward)} mono />
        <KV label="Proposal bond" value={formatUsdc(event.proposal_bond)} mono />
        <CopyRow label="Reward token" value={event.reward_token} />
        <TimeRow
          label="Request timestamp"
          value={unixSecondsToDate(event.request_timestamp)}
        />
      </Section>
      <AncillaryDataSection value={event.ancillary_data} />
    </>
  );
}

function ProposedDetail({ event }: { event: UmaHistoryEvent }) {
  return (
    <>
      <Section title="Proposal">
        <CopyRow label="Proposer" value={event.proposer_address} />
        <PriceRow label="Proposed answer" priceLabel={event.proposed_price_label} />
        <TimeRow
          label="Liveness expires"
          value={unixSecondsToDate(event.expiration_timestamp)}
        />
        <TimeRow
          label="Request timestamp"
          value={unixSecondsToDate(event.request_timestamp)}
        />
      </Section>
      <AncillaryDataSection value={event.ancillary_data} />
    </>
  );
}

function DisputedDetail({ event }: { event: UmaHistoryEvent }) {
  return (
    <>
      <Section title="Dispute">
        <CopyRow label="Disputer" value={event.disputer_address} />
        <CopyRow label="Proposer" value={event.proposer_address} />
        <PriceRow label="Disputed answer" priceLabel={event.proposed_price_label} />
        <TimeRow
          label="Request timestamp"
          value={unixSecondsToDate(event.request_timestamp)}
        />
      </Section>
      {event.triggered_reset ? (
        <Note>
          This dispute reset the question — a new proposal round is required.
        </Note>
      ) : null}
      <AncillaryDataSection value={event.ancillary_data} />
    </>
  );
}

function ResetDetail({ event }: { event: UmaHistoryEvent }) {
  return (
    <>
      <Section title="Reset">
        <CopyRow label="Question id" value={event.question_id} />
        {event.resolve_attempt_status ? (
          <KV label="Resolve attempt" value={event.resolve_attempt_status} mono />
        ) : null}
      </Section>
      {event.resolve_attempt_error ? (
        <Section title="Resolve attempt error">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-foreground/[0.03] border border-border rounded-md p-3">
            {event.resolve_attempt_error}
          </pre>
        </Section>
      ) : null}
      <Note>
        The oracle answered &ldquo;too early&rdquo; instead of settling a price,
        so the adapter reset the question. A new proposal round is required.
      </Note>
    </>
  );
}

function ResolvedDetail({ event }: { event: UmaHistoryEvent }) {
  return (
    <Section title="Resolution">
      <PriceRow label="Settled answer" priceLabel={event.settled_price_label} />
      <KV label="Settled price" value={event.settled_price ?? "—"} mono />
      <KV label="Payouts" value={formatPayouts(event.payouts)} mono />
      <CopyRow label="Question id" value={event.question_id} />
    </Section>
  );
}

function AncillaryDataSection({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <Section title="Ancillary data">
      <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-foreground/[0.03] border border-border rounded-md p-3">
        {value}
      </pre>
    </Section>
  );
}

// Only ever used for the warning case (a dispute or standalone reset that
// requires a fresh proposal round) — no tone prop until a second case exists.
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border px-3 py-2 text-[11px] leading-snug border-warning/30 bg-warning/10 text-warning">
      {children}
    </p>
  );
}

function PriceRow({
  label,
  priceLabel,
}: {
  label: string;
  priceLabel?: UmaOraclePriceLabel;
}) {
  if (!priceLabel || priceLabel === "none") {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">{label}</span>
        <span className="text-xs text-foreground-muted">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-foreground-muted text-xs">{label}</span>
      <Badge tone={umaPriceLabelTone(priceLabel)}>{umaPriceLabelName(priceLabel)}</Badge>
    </div>
  );
}

// RAW DATA view: the event's fields exactly as they were indexed from the
// chain, per event type. Only the fields the type actually carries are shown.
const RAW_FIELDS_BY_TYPE: Record<
  UmaHistoryEventType,
  Array<{ name: string; type: string; key: keyof UmaHistoryEvent }>
> = {
  created: [
    { name: "questionID", type: "bytes32", key: "question_id" },
    { name: "requestTimestamp", type: "uint256", key: "request_timestamp" },
    { name: "creator", type: "address", key: "creator_address" },
    { name: "rewardToken", type: "address", key: "reward_token" },
    { name: "reward", type: "uint256", key: "reward" },
    { name: "proposalBond", type: "uint256", key: "proposal_bond" },
    { name: "ancillaryData", type: "bytes", key: "ancillary_data" },
  ],
  proposed: [
    { name: "proposer", type: "address", key: "proposer_address" },
    { name: "timestamp", type: "uint256", key: "request_timestamp" },
    { name: "proposedPrice", type: "int256", key: "proposed_price" },
    { name: "expirationTimestamp", type: "uint256", key: "expiration_timestamp" },
    { name: "ancillaryData", type: "bytes", key: "ancillary_data" },
  ],
  disputed: [
    { name: "proposer", type: "address", key: "proposer_address" },
    { name: "disputer", type: "address", key: "disputer_address" },
    { name: "timestamp", type: "uint256", key: "request_timestamp" },
    { name: "proposedPrice", type: "int256", key: "proposed_price" },
    { name: "ancillaryData", type: "bytes", key: "ancillary_data" },
  ],
  reset: [
    { name: "questionID", type: "bytes32", key: "question_id" },
    { name: "resolveAttemptStatus", type: "string", key: "resolve_attempt_status" },
    { name: "resolveAttemptError", type: "string", key: "resolve_attempt_error" },
  ],
  resolved: [
    { name: "questionID", type: "bytes32", key: "question_id" },
    { name: "settledPrice", type: "int256", key: "settled_price" },
    { name: "payouts", type: "uint256[]", key: "payouts" },
  ],
};

// Chain-level identifiers every event carries, shown ahead of the per-type
// fields so the raw view always starts from the transaction it came from.
function rawFields(event: UmaHistoryEvent): RawField[] {
  const chain: RawField[] = [
    { name: "txHash", type: "bytes32", value: event.tx_hash },
    { name: "blockNumber", type: "uint256", value: String(event.block_number) },
    { name: "blockTimestamp", type: "string", value: event.timestamp },
  ];
  const specific = RAW_FIELDS_BY_TYPE[event.type]
    .map((f) => ({ name: f.name, type: f.type, value: rawValue(event[f.key]) }))
    .filter((f) => f.value !== "");
  if (event.triggered_reset) {
    specific.push({ name: "triggeredReset", type: "bool", value: "true" });
  }
  return [...chain, ...specific];
}

function rawValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatPayouts(payouts: unknown): string {
  if (payouts === undefined || payouts === null) return "—";
  if (Array.isArray(payouts)) return payouts.join(", ");
  return JSON.stringify(payouts);
}

// Block timestamps come back as RFC3339 from dpm-api.
function parseTimestamp(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
