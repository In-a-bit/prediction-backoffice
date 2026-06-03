"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui";
import type { PolymarketMarketResolution } from "@/lib/types";

export type SlugProposedRow = {
  /** Internal market external_id — null when we can't match by question. */
  market_external_id: string | null;
  plan_external_id: string | null;
  position: number | null;
  /** Source Polymarket event slug */
  polymarket_slug: string;
  question: string;
  polymarket: PolymarketMarketResolution;
};

export function SlugProposedTable({ rows }: { rows: SlugProposedRow[] }) {
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<SlugProposedRow>[]>(
    () => [
      {
        id: "question",
        accessorKey: "question",
        header: "Question",
        cell: ({ row }) => {
          const href = buildHref(row.original);
          return href ? (
            <Link
              href={href}
              className="text-foreground hover:text-accent transition-colors font-medium truncate block max-w-[20rem]"
              title={row.original.question}
            >
              {row.original.question}
            </Link>
          ) : (
            <span
              className="font-medium truncate block max-w-[20rem] text-foreground-muted"
              title={row.original.question}
            >
              {row.original.question}
            </span>
          );
        },
      },
      {
        id: "pm_slug",
        accessorKey: "polymarket_slug",
        header: "Polymarket event",
        cell: ({ row }) => (
          <a
            href={`https://polymarket.com/event/${row.original.polymarket_slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline truncate max-w-[14rem] inline-block"
            title={row.original.polymarket_slug}
          >
            {row.original.polymarket_slug}
          </a>
        ),
      },
      {
        id: "pm_status",
        header: "Polymarket UMA status",
        cell: ({ row }) => (
          <UmaStatusChip value={row.original.polymarket.umaResolutionStatus} />
        ),
      },
      {
        id: "pm_history",
        header: "Status history",
        enableSorting: false,
        cell: ({ row }) => (
          <HistoryChips statuses={row.original.polymarket.umaResolutionStatuses} />
        ),
      },
      {
        id: "pm_prices",
        header: "Prices (Yes / No)",
        cell: ({ row }) => {
          const { outcomePrices, outcomes } = row.original.polymarket;
          if (!outcomePrices.length) {
            return <span className="text-xs text-foreground-muted">—</span>;
          }
          return (
            <div className="flex gap-1.5 flex-wrap">
              {outcomes.map((label, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs bg-surface border border-border rounded px-1.5 py-0.5"
                >
                  <span className="text-foreground-muted">{label}</span>
                  <span className="font-mono font-medium">
                    {outcomePrices[i] !== undefined
                      ? `${(Number(outcomePrices[i]) * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: "pm_liveness",
        header: "Liveness",
        cell: ({ row }) => {
          const liveness = row.original.polymarket.customLiveness;
          return (
            <span className="text-xs text-foreground-muted whitespace-nowrap">
              {formatLiveness(liveness)}
            </span>
          );
        },
      },
      {
        id: "match",
        header: "Internal match",
        cell: ({ row }) =>
          row.original.market_external_id ? (
            <Badge tone="success">Matched</Badge>
          ) : (
            <Badge tone="neutral">Not matched</Badge>
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SearchBox value={globalFilter} onChange={setGlobalFilter} />
        <span className="text-xs text-foreground-muted">
          {rows.length} market{rows.length !== 1 ? "s" : ""} proposed on Polymarket
        </span>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        globalFilter={globalFilter}
        emptyState={{
          title: "No slug-proposed markets",
          description:
            "Markets from Polymarket-slug events that have been proposed on Polymarket will appear here.",
        }}
      />
    </div>
  );
}

function buildHref(row: SlugProposedRow): string | null {
  if (!row.market_external_id) return null;
  const params = new URLSearchParams();
  params.set("source", "manual");
  if (row.plan_external_id) params.set("plan_id", row.plan_external_id);
  if (row.position !== null) params.set("pos", String(row.position));
  params.set("from", "resolutions");
  return `/markets/${encodeURIComponent(row.market_external_id)}?${params.toString()}`;
}

function UmaStatusChip({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-foreground-muted">—</span>;
  const tone =
    value === "proposed"
      ? "info"
      : value === "disputed"
        ? "danger"
        : value === "resolved"
          ? "success"
          : "neutral";
  return <Badge tone={tone}>{value}</Badge>;
}

function HistoryChips({ statuses }: { statuses: string[] }) {
  if (!statuses.length)
    return <span className="text-xs text-foreground-muted">—</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {statuses.map((s, i) => (
        <Badge key={i} tone={s === "disputed" ? "danger" : s === "proposed" ? "info" : "neutral"}>
          {s}
        </Badge>
      ))}
    </div>
  );
}

function formatLiveness(value: string | null): string {
  if (value == null || value === "") return "—";
  const secs = Number(value);
  if (!Number.isFinite(secs) || secs <= 0) return value;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.length > 0 ? parts.join(" ") : `${secs}s`;
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
        placeholder="Search question or slug…"
        className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-surface text-sm placeholder:text-foreground-muted/70 focus:outline-none focus:border-accent transition-colors"
      />
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted">
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
      </span>
    </div>
  );
}
