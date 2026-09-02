"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
import { Badge, ErrorMessage } from "@/components/ui";
import { formatUsdc } from "@/lib/format";
import { umaPriceLabelTone } from "@/lib/market-lifecycle";
import type {
  TokenOutcome,
  UmaOracleHasPriceData,
  UmaOraclePriceLabel,
  UmaOracleRequestData,
  UmaOracleStateData,
  UmaQuestionData,
} from "@/lib/types";

// Clickable question_id for UMA markets (manual + sport — crypto is always
// CTF_ORACLE and never reaches here, see the resolution_type gate at the
// call site). On click, opens a side drawer with two top-level tabs —
// UmaCtfAdapter (the adapter's getQuestion, unchanged from before) and
// Optimistic Oracle (three sub-tabs: getRequest/getState/hasPrice, the live
// ManagedOptimisticOracleV2 reads) — same visual language as the
// crypto-interval MarketDrawer (components/crypto-interval/markets-panel.tsx):
// status badge, uppercase section labels, copy-to-clipboard identifiers,
// timestamps with a relative-time sub-line.
export function UmaQuestionLink({
  externalId,
  questionId,
  tokens,
}: {
  externalId: string;
  questionId: string;
  tokens: TokenOutcome[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Return keyboard focus to the trigger on close, rather than dropping it
  // back to <body> — standard dialog-dismissal behavior.
  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="text-left underline decoration-dotted hover:decoration-solid hover:text-accent transition-colors"
        title="View live UmaCtfAdapter.getQuestion(questionID) data"
      >
        {questionId}
      </button>
      {open ? (
        <QuestionDrawer
          externalId={externalId}
          questionId={questionId}
          tokens={tokens}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
}

type TopTab = "adapter" | "oracle";
type OracleMethod = "request" | "state" | "hasPrice";

function QuestionDrawer({
  externalId,
  questionId,
  tokens,
  onClose,
}: {
  externalId: string;
  questionId: string;
  tokens: TokenOutcome[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TopTab>("adapter");
  const [oracleMethod, setOracleMethod] = useState<OracleMethod>("request");

  // UmaCtfAdapter.getQuestion — unchanged from before the OO tabs existed.
  const adapter = useOracleSection<UmaQuestionData>({ initialLoading: true });
  const [adapterRaw, setAdapterRaw] = useState(false);

  // ManagedOptimisticOracleV2.getRequest/getState/hasPrice — each sub-tab
  // owns its own loading/error/data (via its own useOracleSection instance)
  // so switching tabs never blanks out data you've already fetched for a
  // different sub-tab.
  const request = useOracleSection<UmaOracleRequestData>();
  const [requestRaw, setRequestRaw] = useState(false);
  const oracleState = useOracleSection<UmaOracleStateData>();
  const hasPrice = useOracleSection<UmaOracleHasPriceData>();

  // Drawer opens straight into the adapter tab, so fetch it immediately —
  // the oracle tab's data only loads once the operator actually clicks into
  // it (see selectTopTab/selectOracleMethod below).
  useEffect(() => {
    adapter.fetchData(`/api/dpm/markets/${encodeURIComponent(externalId)}/uma/question`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalId]);

  const fetchOracleMethod = useCallback(
    (method: OracleMethod) => {
      const base = `/api/dpm/markets/${encodeURIComponent(externalId)}/uma/oracle`;
      if (method === "request") request.fetchData(`${base}/request`);
      else if (method === "state") oracleState.fetchData(`${base}/state`);
      else hasPrice.fetchData(`${base}/has-price`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalId],
  );

  // Every tab click re-fetches fresh on-chain data rather than reusing a
  // cached response — an operator flipping tabs while proposing/disputing
  // wants the current state, not a stale snapshot from when the drawer opened.
  function selectTopTab(next: TopTab) {
    setTab(next);
    if (next === "adapter") {
      adapter.fetchData(`/api/dpm/markets/${encodeURIComponent(externalId)}/uma/question`);
    } else {
      fetchOracleMethod(oracleMethod);
    }
  }

  function selectOracleMethod(next: OracleMethod) {
    setOracleMethod(next);
    fetchOracleMethod(next);
  }

  const header = (
    <>
      <div className="flex items-center gap-2">
        <QuestionStatusBadge data={adapter.data} />
        <span className="text-xs text-foreground-muted font-mono">
          #{shortHex(questionId)}
        </span>
      </div>
      <h3 className="mt-1.5 text-sm font-semibold">
        {drawerTitle(tab, oracleMethod)}
      </h3>
    </>
  );

  return (
    <SideDrawer ariaLabel="UMA question data" header={header} onClose={onClose}>
      <TopTabBar tab={tab} onSelect={selectTopTab} />

      {tab === "oracle" ? (
        <OracleMethodTabBar method={oracleMethod} onSelect={selectOracleMethod} />
      ) : null}

      <div className="px-5 py-4 space-y-5 text-sm">
        {tab === "adapter" ? (
          <AdapterTabContent
            loading={adapter.loading}
            error={adapter.error}
            data={adapter.data}
            raw={adapterRaw}
            onToggleRaw={() => setAdapterRaw((r) => !r)}
          />
        ) : oracleMethod === "request" ? (
          <OracleRequestTabContent
            loading={request.loading}
            error={request.error}
            data={request.data}
            raw={requestRaw}
            onToggleRaw={() => setRequestRaw((r) => !r)}
            tokens={tokens}
          />
        ) : oracleMethod === "state" ? (
          <OracleStateTabContent
            loading={oracleState.loading}
            error={oracleState.error}
            data={oracleState.data}
          />
        ) : (
          <OracleHasPriceTabContent
            loading={hasPrice.loading}
            error={hasPrice.error}
            data={hasPrice.data}
          />
        )}
      </div>
    </SideDrawer>
  );
}

// useOracleSection owns one endpoint's loading/error/data plus a monotonic
// request id, so that if a fetch is superseded by a newer one (e.g. the
// operator double-clicks a tab, or clicks away and back before the first
// response lands) the stale response is dropped instead of clobbering
// state a newer fetch already set.
function useOracleSection<T>(opts?: { initialLoading?: boolean }) {
  const [loading, setLoading] = useState(opts?.initialLoading ?? false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);
  const latestRequestId = useRef(0);

  const fetchData = useCallback((url: string) => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setError(null);
    fetchJSON<T>(url)
      .then((result) => {
        if (latestRequestId.current !== requestId) return;
        setData(result);
      })
      .catch((err) => {
        if (latestRequestId.current !== requestId) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (latestRequestId.current !== requestId) return;
        setLoading(false);
      });
  }, []);

  return { loading, error, data, fetchData };
}

function drawerTitle(tab: TopTab, method: OracleMethod): string {
  if (tab === "adapter") return "UmaCtfAdapter.getQuestion";
  if (method === "request") return "ManagedOptimisticOracleV2.getRequest";
  if (method === "state") return "ManagedOptimisticOracleV2.getState";
  return "ManagedOptimisticOracleV2.hasPrice";
}

function fetchJSON<T>(url: string): Promise<T> {
  return fetch(url).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((json as { error?: string })?.error ?? `request failed (${res.status})`);
    }
    return json as T;
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ----- Top-level tab bar: UmaCtfAdapter | Optimistic Oracle -----

function TopTabBar({
  tab,
  onSelect,
}: {
  tab: TopTab;
  onSelect: (next: TopTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Contract" className="flex border-b border-border px-5">
      <TopTabButton label="UmaCtfAdapter" active={tab === "adapter"} onClick={() => onSelect("adapter")} />
      <TopTabButton label="Optimistic Oracle" active={tab === "oracle"} onClick={() => onSelect("oracle")} />
    </div>
  );
}

function TopTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "px-3 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors cursor-pointer " +
        (active
          ? "text-foreground border-accent"
          : "text-foreground-muted border-transparent hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

// ----- Sub-tab bar (Optimistic Oracle only): getRequest | getState | hasPrice -----

const ORACLE_METHODS: Array<{ key: OracleMethod; label: string }> = [
  { key: "request", label: "getRequest" },
  { key: "state", label: "getState" },
  { key: "hasPrice", label: "hasPrice" },
];

function OracleMethodTabBar({
  method,
  onSelect,
}: {
  method: OracleMethod;
  onSelect: (next: OracleMethod) => void;
}) {
  return (
    <div role="tablist" aria-label="Optimistic Oracle method" className="flex gap-1.5 px-5 pt-3">
      {ORACLE_METHODS.map((m) => {
        const active = method === m.key;
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(m.key)}
            className={
              "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer " +
              (active
                ? "bg-accent text-white border-accent"
                : "border-border text-foreground-muted hover:text-foreground hover:bg-foreground/[0.04]")
            }
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ----- UmaCtfAdapter tab content — unchanged from before the OO tabs existed -----

function AdapterTabContent({
  loading,
  error,
  data,
  raw,
  onToggleRaw,
}: {
  loading: boolean;
  error: string | null;
  data: UmaQuestionData | null;
  raw: boolean;
  onToggleRaw: () => void;
}) {
  if (loading) return <p className="text-foreground-muted text-xs">Querying on-chain…</p>;
  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!data) return null;

  return (
    <>
      <RawDataToggle raw={raw} onToggle={onToggleRaw} />

      {raw ? (
        <RawView data={data} />
      ) : (
        <>
          <Section title="Timing">
            <TimeRow label="Request timestamp" value={unixSecondsToDate(data.request_timestamp)} />
            <TimeRow
              label="Manual resolution"
              value={unixSecondsToDate(data.manual_resolution_timestamp)}
            />
            <KV label="Liveness" value={`${data.liveness}s`} mono />
          </Section>

          <Section title="Amounts">
            <KV label="Reward" value={formatUsdc(data.reward)} mono />
            <KV label="Proposal bond" value={formatUsdc(data.proposal_bond)} mono />
          </Section>

          <Section title="Flags">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={data.resolved ? "success" : "neutral"}>
                resolved: {String(data.resolved)}
              </Badge>
              <Badge tone={data.paused ? "warning" : "neutral"}>
                paused: {String(data.paused)}
              </Badge>
              <Badge tone={data.reset ? "warning" : "neutral"}>
                reset: {String(data.reset)}
              </Badge>
              <Badge tone={data.refund ? "warning" : "neutral"}>
                refund: {String(data.refund)}
              </Badge>
            </div>
          </Section>

          <Section title="Identifiers">
            <CopyRow label="Question id" value={data.question_id} />
            <CopyRow label="Reward token" value={data.reward_token} />
            <CopyRow label="Creator" value={data.creator} />
          </Section>

          <Section title="Ancillary data">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-foreground/[0.03] border border-border rounded-md p-3">
              {data.ancillary_data_text ?? data.ancillary_data}
            </pre>
          </Section>
        </>
      )}
    </>
  );
}

// ----- Optimistic Oracle tab content: getRequest -----

function OracleRequestTabContent({
  loading,
  error,
  data,
  raw,
  onToggleRaw,
  tokens,
}: {
  loading: boolean;
  error: string | null;
  data: UmaOracleRequestData | null;
  raw: boolean;
  onToggleRaw: () => void;
  tokens: TokenOutcome[];
}) {
  if (loading) return <p className="text-foreground-muted text-xs">Querying on-chain…</p>;
  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!data) return null;

  return (
    <>
      <RawDataToggle raw={raw} onToggle={onToggleRaw} />

      {raw ? (
        <OracleRequestRawView data={data} />
      ) : (
        <Section title="Request">
          <CopyRow label="Proposer" value={data.proposer} />
          <CopyRow label="Disputer" value={data.disputer} />
          <CopyRow label="Currency" value={data.currency} />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-foreground-muted text-xs">Settled</span>
            <Badge tone={data.settled ? "success" : "neutral"}>{String(data.settled)}</Badge>
          </div>
          <KV label="Bond" value={formatUsdc(data.bond)} mono />
          <KV label="Custom liveness" value={`${data.custom_liveness}s`} mono />
          <PriceRow label="Proposed price" priceLabel={data.proposed_price_label} tokens={tokens} />
          <PriceRow label="Resolved price" priceLabel={data.resolved_price_label} tokens={tokens} />
          <TimeRow label="Expiration time" value={unixSecondsToDate(data.expiration_time)} />
          <KV label="Reward" value={formatUsdc(data.reward)} mono />
          <KV label="Final fee" value={formatUsdc(data.final_fee)} mono />
        </Section>
      )}
    </>
  );
}

// Maps a request's classified price label to the market's actual outcome
// name — same convention as components/market-outcome.tsx's
// resolveProposedLabel, extended with the two states unique to a live
// oracle read (no proposal/settlement yet, or UMA's too-early sentinel).
function resolveOraclePriceLabel(label: UmaOraclePriceLabel, tokens: TokenOutcome[]): string {
  switch (label) {
    case "first_outcome_yes":
      return tokens[0]?.outcome ?? "First outcome";
    case "second_outcome_yes":
      return tokens[1]?.outcome ?? "Second outcome";
    case "fifty_fifty":
      return "50 / 50";
    case "too_early":
      return "Too early";
    default:
      return "Unknown";
  }
}

function PriceRow({
  label,
  priceLabel,
  tokens,
}: {
  label: string;
  priceLabel: UmaOraclePriceLabel;
  tokens: TokenOutcome[];
}) {
  if (priceLabel === "none") {
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
      <Badge tone={umaPriceLabelTone(priceLabel)}>{resolveOraclePriceLabel(priceLabel, tokens)}</Badge>
    </div>
  );
}

// A raw field before it is bound to a response: the on-chain name, its
// Solidity type, and how to read the value out of the fetched data.
type RawFieldDescriptor<T> = {
  name: string;
  type: string;
  read: (d: T) => string;
};

function toRawFields<T>(descriptors: RawFieldDescriptor<T>[], data: T): RawField[] {
  return descriptors.map((d) => ({ name: d.name, type: d.type, value: d.read(data) }));
}

// getRequest(...) → structOptimisticOracleV2Interface.Request field
// names/types, in ABI order (libs/contracts/managedoraclev2's Request /
// RequestSettings structs).
const ORACLE_REQUEST_RAW_FIELDS: RawFieldDescriptor<UmaOracleRequestData>[] = [
  { name: "proposer", type: "address", read: (d) => d.proposer },
  { name: "disputer", type: "address", read: (d) => d.disputer },
  { name: "currency", type: "address", read: (d) => d.currency },
  { name: "settled", type: "bool", read: (d) => String(d.settled) },
  { name: "requestSettings.eventBased", type: "bool", read: (d) => String(d.event_based) },
  { name: "requestSettings.refundOnDispute", type: "bool", read: (d) => String(d.refund_on_dispute) },
  {
    name: "requestSettings.callbackOnPriceProposed",
    type: "bool",
    read: (d) => String(d.callback_on_price_proposed),
  },
  {
    name: "requestSettings.callbackOnPriceDisputed",
    type: "bool",
    read: (d) => String(d.callback_on_price_disputed),
  },
  {
    name: "requestSettings.callbackOnPriceSettled",
    type: "bool",
    read: (d) => String(d.callback_on_price_settled),
  },
  { name: "requestSettings.bond", type: "uint256", read: (d) => d.bond },
  { name: "requestSettings.customLiveness", type: "uint256", read: (d) => d.custom_liveness },
  { name: "proposedPrice", type: "int256", read: (d) => d.proposed_price },
  { name: "resolvedPrice", type: "int256", read: (d) => d.resolved_price },
  { name: "expirationTime", type: "uint256", read: (d) => d.expiration_time },
  { name: "reward", type: "uint256", read: (d) => d.reward },
  { name: "finalFee", type: "uint256", read: (d) => d.final_fee },
];

function OracleRequestRawView({ data }: { data: UmaOracleRequestData }) {
  return (
    <RawFieldList
      signature="getRequest(...) → structOptimisticOracleV2Interface.Request"
      fields={toRawFields(ORACLE_REQUEST_RAW_FIELDS, data)}
    />
  );
}

// ----- Optimistic Oracle tab content: getState -----

function OracleStateTabContent({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: UmaOracleStateData | null;
}) {
  if (loading) return <p className="text-foreground-muted text-xs">Querying on-chain…</p>;
  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!data) return null;

  return (
    <Section title="State">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">state</span>
        <Badge tone="info">
          {data.name} ({data.value})
        </Badge>
      </div>
      <p className="text-[11px] text-foreground-muted">OptimisticOracleV2Interface.State enum</p>
    </Section>
  );
}

// ----- Optimistic Oracle tab content: hasPrice -----

function OracleHasPriceTabContent({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: UmaOracleHasPriceData | null;
}) {
  if (loading) return <p className="text-foreground-muted text-xs">Querying on-chain…</p>;
  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!data) return null;

  return (
    <Section title="Has price">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">has price</span>
        <Badge tone={data.has_price ? "success" : "neutral"}>{String(data.has_price)}</Badge>
      </div>
      <p className="text-[11px] text-foreground-muted">true once settle() can be called</p>
    </Section>
  );
}

// getQuestion(bytes32) → structQuestionData field names/types, in ABI order
// (libs/contracts/umactfadapter's QuestionData / the UmaCtfAdapter ABI).
const RAW_FIELDS: RawFieldDescriptor<UmaQuestionData>[] = [
  { name: "requestTimestamp", type: "uint256", read: (d) => d.request_timestamp },
  { name: "reward", type: "uint256", read: (d) => d.reward },
  { name: "proposalBond", type: "uint256", read: (d) => d.proposal_bond },
  { name: "liveness", type: "uint256", read: (d) => d.liveness },
  { name: "manualResolutionTimestamp", type: "uint256", read: (d) => d.manual_resolution_timestamp },
  { name: "resolved", type: "bool", read: (d) => String(d.resolved) },
  { name: "paused", type: "bool", read: (d) => String(d.paused) },
  { name: "reset", type: "bool", read: (d) => String(d.reset) },
  { name: "refund", type: "bool", read: (d) => String(d.refund) },
  { name: "rewardToken", type: "address", read: (d) => d.reward_token },
  { name: "creator", type: "address", read: (d) => d.creator },
  { name: "ancillaryData", type: "bytes", read: (d) => d.ancillary_data },
];

function RawView({ data }: { data: UmaQuestionData }) {
  return (
    <RawFieldList
      signature="getQuestion(bytes32) → structQuestionData"
      fields={toRawFields(RAW_FIELDS, data)}
    />
  );
}

function QuestionStatusBadge({ data }: { data: UmaQuestionData | null }) {
  if (!data) return <Badge tone="neutral">…</Badge>;
  if (data.resolved) return <Badge tone="success">RESOLVED</Badge>;
  if (data.reset) return <Badge tone="warning">RESET</Badge>;
  if (data.paused) return <Badge tone="warning">PAUSED</Badge>;
  if (data.refund) return <Badge tone="warning">REFUND</Badge>;
  return <Badge tone="info">INITIALIZED</Badge>;
}
