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
import type { CreatedMarket } from "@/lib/types";

type FilterKey = "active" | "verified" | "failed" | "awaiting_price" | "all";

type FilterDef = {
  key: FilterKey;
  label: string;
  match: (m: CreatedMarket, nowMs: number) => boolean;
};

const FILTERS: FilterDef[] = [
  {
    key: "active",
    label: "Active",
    match: (m) =>
      m.status === "PENDING" || (m.status === "CREATED" && !m.verified_at),
  },
  {
    key: "verified",
    label: "Verified",
    match: (m) => m.status === "CREATED" && Boolean(m.verified_at),
  },
  { key: "failed", label: "Failed", match: (m) => m.status === "FAILED" },
  {
    key: "awaiting_price",
    label: "Awaiting price",
    match: (m, nowMs) =>
      m.status === "PENDING" && new Date(m.slot_end).getTime() < nowMs,
  },
  { key: "all", label: "All", match: () => true },
];

const PAGE_SIZES = [10, 25, 100, Number.POSITIVE_INFINITY] as const;

export function MarketsPanel({ markets }: { markets: CreatedMarket[] }) {
  const [filter, setFilter] = useState<FilterKey>("active");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(10);
  const [selected, setSelected] = useState<CreatedMarket | null>(null);

  const nowMs = useNowMs();

  const counts = useMemo(() => {
    const c = { active: 0, verified: 0, failed: 0, awaiting_price: 0 };
    for (const m of markets) {
      if (FILTERS[0].match(m, nowMs)) c.active++;
      if (FILTERS[1].match(m, nowMs)) c.verified++;
      if (FILTERS[2].match(m, nowMs)) c.failed++;
      if (FILTERS[3].match(m, nowMs)) c.awaiting_price++;
    }
    return c;
  }, [markets, nowMs]);

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

  const visible = useMemo(
    () =>
      Number.isFinite(pageSize) ? filtered.slice(0, pageSize) : filtered,
    [filtered, pageSize],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          const count =
            f.key === "all"
              ? markets.length
              : counts[f.key as keyof typeof counts];
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
        <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
          Show
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-1.5 py-1 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {Number.isFinite(n) ? n : "All"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="px-4 py-2 text-xs text-foreground-muted border-b border-border">
        {visible.length === filtered.length
          ? `${filtered.length} matching`
          : `${visible.length} of ${filtered.length} matching`}
        <span className="mx-1.5">·</span>
        {markets.length} loaded
        <span className="mx-1.5">·</span>
        <span className="text-success">{counts.verified} verified</span>
        <span className="mx-1.5">·</span>
        <span className={counts.active > 0 ? "text-info" : ""}>
          {counts.active} active
        </span>
        <span className="mx-1.5">·</span>
        <span className={counts.failed > 0 ? "text-danger" : ""}>
          {counts.failed} failed
        </span>
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

      {filtered.length > visible.length && (
        <div className="px-4 py-3 text-center text-xs text-foreground-muted border-t border-border">
          {filtered.length - visible.length} more hidden · choose a larger page size to see them
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
  if (market.status === "CREATED") {
    return market.verified_at ? (
      <Badge tone="success">VERIFIED</Badge>
    ) : (
      <Badge tone="info">VERIFYING</Badge>
    );
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
