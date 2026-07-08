"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Badge, EmptyState } from "@/components/ui";
import {
  formatDateTime,
  formatDateTimeFull,
  formatPrice,
  formatRelative,
  shortId,
} from "@/lib/format";
import type { CreatedMarket, TaskStats } from "@/lib/types";

type FilterKey = "active" | "verified" | "resolved" | "failed" | "awaiting_price" | "all";

type FilterDef = {
  key: FilterKey;
  label: string;
  match: (m: CreatedMarket, nowMs: number) => boolean;
};

const FILTERS: FilterDef[] = [
  { key: "all", label: "All", match: () => true },
  {
    key: "active",
    label: "Active",
    match: (m) => m.status === "PENDING" || m.status === "CREATED",
  },
  {
    key: "verified",
    label: "Verified",
    match: (m) => m.status === "VERIFIED",
  },
  {
    key: "resolved",
    label: "Resolved",
    match: (m) => m.status === "RESOLVED",
  },
  { key: "failed", label: "Failed", match: (m) => m.status === "FAILED" },
  {
    key: "awaiting_price",
    label: "Awaiting price",
    match: (m, nowMs) =>
      m.status === "PENDING" && new Date(m.slot_end).getTime() < nowMs,
  },
];

type GlobalCounts = {
  active: number;
  verified: number;
  resolved: number;
  failed: number;
  awaiting_price: number;
  all: number;
};

function statsToGlobalCounts(stats: TaskStats): GlobalCounts {
  return {
    // active = PENDING (not yet past slot_end) + CREATED but not yet verified
    active: (stats.pending_now ?? 0) + (stats.awaiting_verify_now ?? 0),
    verified: stats.total_verified ?? 0,
    resolved: stats.total_resolved ?? 0,
    // failed_last_24h is the best available proxy for failed total
    failed: stats.failed_last_24h ?? 0,
    awaiting_price: stats.awaiting_price_count ?? 0,
    // total_all covers all markets regardless of status.
    all: stats.total_all ?? 0,
  };
}

export function MarketsPanel({
  markets,
  taskStats,
}: {
  markets: CreatedMarket[];
  taskStats?: TaskStats;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CreatedMarket | null>(null);

  const nowMs = useNowMs();

  // Page-local counts — used for the status bar summary.
  const pageCounts = useMemo(() => {
    const c = { active: 0, verified: 0, resolved: 0, failed: 0, awaiting_price: 0 };
    for (const m of markets) {
      if (FILTERS[1].match(m, nowMs)) c.active++;
      if (FILTERS[2].match(m, nowMs)) c.verified++;
      if (FILTERS[3].match(m, nowMs)) c.resolved++;
      if (FILTERS[4].match(m, nowMs)) c.failed++;
      if (FILTERS[5].match(m, nowMs)) c.awaiting_price++;
    }
    return c;
  }, [markets, nowMs]);

  // Global counts for the filter tab badges — from task.stats when available,
  // otherwise fall back to the page-local tally.
  const counts: GlobalCounts = useMemo(
    () =>
      taskStats
        ? statsToGlobalCounts(taskStats)
        : { ...pageCounts, all: markets.length },
    [taskStats, pageCounts, markets.length],
  );

  const filtered = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    const q = query.trim().toLowerCase();
    return markets.filter((m) => {
      if (!match(m, nowMs)) return false;
      if (!q) return true;
      return (
        m.slug.toLowerCase().includes(q) ||
        (m.market_external_id?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [markets, filter, query, nowMs]);

  // Server already delivers one page; filter locally within that page only.
  const visible = filtered;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const count = counts[f.key as keyof typeof counts];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer " +
                (isActive
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-foreground/[0.03] text-foreground-muted border-border hover:text-foreground hover:bg-foreground/5")
              }
            >
              {f.label}
              <span
                className={
                  "tabular-nums text-[10px] " +
                  (isActive ? "opacity-80" : "opacity-70")
                }
              >
                {count}
              </span>
            </button>
          );
        })}
        <div className="flex-1" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by slug or market id…"
          className="w-56 px-2.5 py-1 text-xs rounded-md border border-border bg-background placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>


      {visible.length === 0 ? (
        <EmptyState
          title="No markets match"
          description={
            markets.length === 0
              ? "Markets will appear here as the create loop runs."
              : "Try a different filter or clear the search."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-foreground-muted border-b border-border">
                <th className="px-5 py-2.5 font-medium">Slot end</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">priceToBeat</th>
                <th className="px-3 py-2.5 font-medium">Slug</th>
                <th className="px-5 py-2.5 font-medium">Market</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <MarketRow
                  key={m.id}
                  market={m}
                  selected={selected?.id === m.id}
                  onClick={() => setSelected(m)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MarketDrawer market={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function MarketRow({
  market,
  selected,
  onClick,
}: {
  market: CreatedMarket;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      className={
        "border-b border-border last:border-0 cursor-pointer outline-none transition-colors " +
        (selected
          ? "bg-accent/10"
          : "hover:bg-foreground/[0.03] focus-visible:bg-foreground/5")
      }
    >
      <td className="px-5 py-2.5 whitespace-nowrap">
        <div className="font-medium">{formatDateTime(market.slot_end)}</div>
        <div className="text-xs text-foreground-muted">
          {formatRelative(market.slot_end)}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <MarketStatusBadge market={market} />
        {market.error ? (
          <div
            className="text-xs text-danger truncate max-w-[14rem] mt-0.5"
            title={market.error}
          >
            {market.error}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 tabular-nums">
        {formatPrice(market.price_to_beat)}
      </td>
      <td className="px-3 py-2.5">
        <code className="text-xs text-foreground-muted">{market.slug}</code>
      </td>
      <td className="px-5 py-2.5 text-foreground-muted">
        <code className="text-xs">{shortId(market.market_external_id)}</code>
      </td>
    </tr>
  );
}

function MarketStatusBadge({ market }: { market: CreatedMarket }) {
  if (market.status === "FAILED") return <Badge tone="danger">FAILED</Badge>;
  if (market.status === "PENDING") return <Badge tone="warning">PENDING</Badge>;
  if (market.status === "VERIFIED") return <Badge tone="success">VERIFIED</Badge>;
  if (market.status === "RESOLVED") return <Badge tone="neutral">RESOLVED</Badge>;
  if (market.status === "CREATED") {
    return <Badge tone="info">VERIFYING</Badge>;
  }
  return <Badge tone="neutral">{market.status}</Badge>;
}

function MarketDrawer({
  market,
  onClose,
}: {
  market: CreatedMarket | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!market) return;
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
  }, [market, onClose]);

  if (!market) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`Market ${market.slug}`}
    >
      <div
        className="flex-1 bg-foreground/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="w-full sm:w-[28rem] h-full bg-background border-l border-border shadow-xl overflow-y-auto animate-in slide-in-from-right">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur px-5 py-4 border-b border-border flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <MarketStatusBadge market={market} />
              <span className="text-xs text-foreground-muted">
                #{market.id}
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-mono truncate" title={market.slug}>
              {market.slug}
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
          {market.error && (
            <Section title="Error">
              <pre className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-md p-3 whitespace-pre-wrap break-all">
                {market.error}
              </pre>
            </Section>
          )}

          <Section title="Timing">
            <TimeRow label="Slot start" value={market.slot_start} />
            <TimeRow label="Slot end" value={market.slot_end} />
            <TimeRow label="Created" value={market.created_at} />
            <TimeRow label="Updated" value={market.updated_at} />
            <TimeRow label="Verified" value={market.verified_at ?? null} />
          </Section>

          <Section title="Pricing">
            <KV label="priceToBeat" value={formatPrice(market.price_to_beat)} mono />
          </Section>

          <Section title="Identifiers">
            <CopyRow label="Market external id" value={market.market_external_id} />
            <CopyRow label="Event external id" value={market.event_external_id} />
            <CopyRow label="Slug" value={market.slug} />
          </Section>

          <Section title="Open">
            <div className="flex flex-wrap gap-2">
              {market.market_external_id && (
                <Link
                  href={`/markets/${market.market_external_id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-foreground/5 text-foreground hover:bg-foreground/10 border border-border"
                >
                  Market page →
                </Link>
              )}
              {market.event_external_id && (
                <Link
                  href={`/events/${market.event_external_id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-foreground/5 text-foreground hover:bg-foreground/10 border border-border"
                >
                  Event page →
                </Link>
              )}
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
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
          "text-right tabular-nums " + (mono ? "font-mono text-xs" : "text-sm")
        }
      >
        {value}
      </span>
    </div>
  );
}

function TimeRow({ label, value }: { label: string; value: string | null }) {
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

let cachedNowMs = 0;
const clockListeners = new Set<() => void>();
let clockTimer: number | null = null;

function subscribeClock(onChange: () => void) {
  clockListeners.add(onChange);
  if (cachedNowMs === 0) cachedNowMs = Date.now();
  if (clockTimer === null) {
    clockTimer = window.setInterval(() => {
      cachedNowMs = Date.now();
      for (const l of clockListeners) l();
    }, 30_000);
  }
  return () => {
    clockListeners.delete(onChange);
    if (clockListeners.size === 0 && clockTimer !== null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

function getNowMs() {
  return cachedNowMs;
}

function getServerNowMs() {
  return 0;
}

function useNowMs() {
  return useSyncExternalStore(subscribeClock, getNowMs, getServerNowMs);
}
