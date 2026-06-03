"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ComboSearch } from "@/components/combo-search";
import { DataTable } from "@/components/data-table";
import { Badge, buttonVariants } from "@/components/ui";
import {
  bucketUma,
  UMA_BUCKET_LABEL,
} from "@/lib/aggregations";
import type { MarketRow } from "@/lib/market-rows";
import type { OperatorLogEntry } from "@/lib/types";

// ResolutionsTable renders the per-tab market list. Columns: Question,
// Source, Event, Disputed-at (or Created when not disputed), Operator-log
// activity for the market, and a Propose action that deep-links the
// existing market detail page.

export function ResolutionsTable({
  rows,
  log,
  tab,
}: {
  rows: MarketRow[];
  log: OperatorLogEntry[];
  tab: string;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [source, setSource] = useState<string | undefined>();

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.source);
    return [
      { value: "", label: "All sources" },
      ...[...set].map((s) => ({ value: s, label: capitalize(s) })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (source && r.source !== source) return false;
      return true;
    });
  }, [rows, source]);

  const columns = useMemo<ColumnDef<MarketRow>[]>(
    () => [
      {
        id: "question",
        accessorKey: "question",
        header: "Question",
        cell: ({ row }) => (
          <Link
            href={openHref(row.original)}
            className="text-foreground hover:text-accent transition-colors font-medium truncate block max-w-[20rem]"
            title={row.original.question}
          >
            {row.original.question}
          </Link>
        ),
      },
      {
        id: "source",
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => (
          <Badge tone={sourceTone(row.original.source)}>
            {row.original.source}
          </Badge>
        ),
      },
      {
        id: "event_title",
        accessorKey: "event_title",
        header: "Event",
        cell: ({ row }) =>
          row.original.event_title ? (
            <Link
              href={`/events/${encodeURIComponent(row.original.event_external_id ?? "")}?from=resolutions`}
              className="text-xs text-accent hover:underline truncate max-w-[16rem] inline-block align-middle"
              title={row.original.event_title}
            >
              {row.original.event_title}
            </Link>
          ) : (
            <span className="text-xs text-foreground-muted">—</span>
          ),
      },
      {
        id: "uma_status",
        accessorKey: "uma_resolution_status",
        header: "UMA status",
        cell: ({ row }) => <UmaChip value={row.original.uma_resolution_status} />,
      },
      {
        id: "liveness",
        accessorKey: "liveness",
        header: "Liveness",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-foreground-muted">
            {formatLiveness(row.original.liveness)}
          </span>
        ),
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Since",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-foreground-muted">
            {formatDate(row.original.created_at)}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "log_activity",
        header: "Log activity",
        enableSorting: false,
        cell: ({ row }) => (
          <LogActivityChips
            externalId={row.original.market_external_id}
            log={log}
          />
        ),
      },
    ],
    [log],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={globalFilter} onChange={setGlobalFilter} />
          <ComboSearch
            options={sourceOptions}
            value={source ?? ""}
            onChange={(v) => setSource(v && v !== "" ? v : undefined)}
            ariaLabel="Source filter"
            triggerLabel={source ? `Source: ${capitalize(source)}` : "Source: all"}
            clearable
          />
        </div>
        <span className="text-xs text-foreground-muted">
          {filtered.length} markets — {prettyTabLabel(tab)}
        </span>
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        globalFilter={globalFilter}
        initialSorting={[{ id: "created_at", desc: true }]}
        emptyState={{
          title: "Nothing to resolve",
          description:
            tab === "first_time_disputed"
              ? "No first-time disputes detected. Disputes that have happened before are tracked under the Disputed tab."
              : "Markets in this state will appear here as they roll through the resolution flow.",
        }}
      />
    </div>
  );
}

function prettyTabLabel(tab: string): string {
  if (tab === "first_time_disputed") return "first-time disputed";
  return UMA_BUCKET_LABEL[tab as keyof typeof UMA_BUCKET_LABEL] ?? tab;
}


function LogActivityChips({
  externalId,
  log,
}: {
  externalId: string;
  log: OperatorLogEntry[];
}) {
  const related = log.filter((e) => e.resource_external_id === externalId);
  if (related.length === 0) {
    return <span className="text-xs text-foreground-muted">—</span>;
  }
  const counts: Record<string, number> = {};
  for (const e of related) {
    const action = e.action || "unknown";
    counts[action] = (counts[action] ?? 0) + 1;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(counts).map(([action, count]) => (
        <Badge tone="neutral" key={action}>
          {count} {action.replaceAll("_", " ")}
        </Badge>
      ))}
    </div>
  );
}

function UmaChip({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-foreground-muted">—</span>;
  const bucket = bucketUma(value);
  const tone =
    bucket === "disputed"
      ? "danger"
      : bucket === "settled"
        ? "success"
        : bucket === "proposed"
          ? "info"
          : bucket === "challenge_period"
            ? "warning"
            : "neutral";
  return <Badge tone={tone}>{UMA_BUCKET_LABEL[bucket]}</Badge>;
}

function openHref(row: MarketRow): string {
  const params = new URLSearchParams();
  params.set("source", row.source);
  if (row.plan_external_id) params.set("plan_id", row.plan_external_id);
  if (row.position !== undefined) params.set("pos", String(row.position));
  if (row.sport_market_id !== undefined)
    params.set("sport_market_id", String(row.sport_market_id));
  if (row.crypto_event_id !== undefined)
    params.set("crypto_event_id", String(row.crypto_event_id));
  params.set("from", "resolutions");
  return `/markets/${encodeURIComponent(row.market_external_id)}?${params.toString()}`;
}

function sourceTone(s: MarketRow["source"]): "info" | "warning" | "neutral" {
  return s === "sport" ? "info" : s === "crypto" ? "warning" : "neutral";
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex-1 min-w-[14rem]">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search question, event, external_id…"
        className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-surface text-sm placeholder:text-foreground-muted/70 focus:outline-none focus:border-accent transition-colors"
      />
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted">
        <SearchIcon />
      </span>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// Liveness is the UMA dispute window, stored as a seconds string. Render it as
// a compact human duration (e.g. 7200 -> "2h"). Falls back to a dash when the
// backend hasn't supplied it yet.
function formatLiveness(value: string | null): string {
  if (value == null || value === "") return "—";
  const secs = Number(value);
  if (!Number.isFinite(secs) || secs <= 0) return value;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !d && !h) parts.push(`${s}s`);
  return parts.length > 0 ? parts.join(" ") : `${secs}s`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
