"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Badge, ErrorMessage } from "@/components/ui";
import { formatDateTimeFull, formatRelative } from "@/lib/format";
import type { UmaQuestionData } from "@/lib/types";

// Clickable question_id for UMA markets (manual + sport — crypto is always
// CTF_ORACLE and never reaches here, see the resolution_type gate at the
// call site). On click, fetches a live on-chain UmaCtfAdapter.getQuestion
// read via the Next proxy route and shows it in a side drawer — same visual
// language as the crypto-interval MarketDrawer (components/crypto-interval/
// markets-panel.tsx): status badge, uppercase section labels, copy-to-
// clipboard identifiers, timestamps with a relative-time sub-line.
export function UmaQuestionLink({
  externalId,
  questionId,
}: {
  externalId: string;
  questionId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
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
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function QuestionDrawer({
  externalId,
  questionId,
  onClose,
}: {
  externalId: string;
  questionId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UmaQuestionData | null>(null);
  const [rawMode, setRawMode] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    // QuestionDrawer is only ever mounted fresh (the parent renders it
    // conditionally on `open`), so the initial loading/error state above
    // already covers a re-open — no need to reset it here.
    let cancelled = false;
    fetch(`/api/dpm/markets/${encodeURIComponent(externalId)}/uma/question`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (json as { error?: string })?.error ?? `request failed (${res.status})`,
          );
        }
        return json as UmaQuestionData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [externalId]);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="UMA question data"
    >
      <div
        className="flex-1 bg-foreground/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="w-full sm:w-[28rem] h-full bg-background border-l border-border shadow-xl overflow-y-auto animate-in slide-in-from-right">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur px-5 py-4 border-b border-border flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <QuestionStatusBadge data={data} />
              <span className="text-xs text-foreground-muted font-mono">
                #{shortHex(questionId)}
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-semibold">
              UmaCtfAdapter.getQuestion
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground-muted hover:text-foreground p-1 rounded-md hover:bg-foreground/5 cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-4 space-y-5 text-sm">
          {loading ? (
            <p className="text-foreground-muted text-xs">Querying on-chain…</p>
          ) : error ? (
            <ErrorMessage>{error}</ErrorMessage>
          ) : data ? (
            <>
              <RawDataToggle raw={rawMode} onToggle={() => setRawMode((r) => !r)} />

              {rawMode ? (
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
                    <KV label="Reward" value={data.reward} mono />
                    <KV label="Proposal bond" value={data.proposal_bond} mono />
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
          ) : null}
        </div>
      </aside>
    </div>
  );
}

// Off by default: shows the formatted sections below. On: shows the raw
// getQuestion(bytes32) tuple exactly as UmaCtfAdapter returns it on-chain —
// same field names/order/units a Polygonscan "Read Contract" call would show.
function RawDataToggle({
  raw,
  onToggle,
}: {
  raw: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={raw}
      title="Toggle raw on-chain getQuestion output"
      className={
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors " +
        (raw
          ? "bg-accent/10 text-accent border-accent/20 dark:bg-accent/20"
          : "bg-foreground/5 text-foreground-muted border-border hover:text-foreground")
      }
    >
      <span
        className={
          "w-1.5 h-1.5 rounded-full " + (raw ? "bg-accent" : "bg-foreground-muted/40")
        }
      />
      RAW DATA
    </button>
  );
}

// getQuestion(bytes32) → structQuestionData field names/types, in ABI order
// (libs/contracts/umactfadapter's QuestionData / the UmaCtfAdapter ABI).
const RAW_FIELDS: Array<{
  name: string;
  type: string;
  read: (d: UmaQuestionData) => string;
}> = [
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
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-foreground-muted">
        getQuestion(bytes32) → structQuestionData
      </p>
      <div className="space-y-2.5">
        {RAW_FIELDS.map((field) => (
          <div key={field.name} className="border-b border-border/60 pb-2 last:border-0">
            <div className="text-[10px] text-foreground-muted">
              {field.name} <span className="text-foreground-muted/60">({field.type})</span>
            </div>
            <div className="text-xs font-mono break-all mt-0.5">{field.read(data)}</div>
          </div>
        ))}
      </div>
    </div>
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

function shortHex(value: string): string {
  const v = value.startsWith("0x") ? value.slice(2) : value;
  return v.length > 10 ? `${v.slice(0, 10)}…` : v;
}

// on-chain timestamps are unix seconds as base-10 strings; "0" means unset
// (e.g. manual_resolution_timestamp before a manual resolution window opens).
function unixSecondsToDate(value: string): Date | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-foreground-muted mb-2">
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-foreground-muted text-xs">{label}</span>
      <span
        className={
          "text-right break-all " + (mono ? "font-mono text-xs" : "text-sm")
        }
      >
        {value}
      </span>
    </div>
  );
}

function TimeRow({ label, value }: { label: string; value: Date | null }) {
  if (!value) {
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
      <span className="text-right">
        <div className="text-xs font-mono">{formatDateTimeFull(value)}</div>
        <div className="text-[10px] text-foreground-muted">
          {formatRelative(value)}
        </div>
      </span>
    </div>
  );
}

function CopyRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">{label}</span>
        <span className="text-xs text-foreground-muted">—</span>
      </div>
    );
  }
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked — silent
    }
  };
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground-muted text-xs">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-[10px] text-foreground-muted hover:text-foreground cursor-pointer"
          aria-label={`Copy ${label}`}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <code className="block text-xs font-mono break-all bg-foreground/[0.03] border border-border rounded px-2 py-1">
        {value}
      </code>
    </div>
  );
}
