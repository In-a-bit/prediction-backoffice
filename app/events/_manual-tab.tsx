"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ComboSearch } from "@/components/combo-search";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui";

import type { ManualEventRow, ManualPayload } from "./_types";

// Manual events tab — operator-driven plans grouped by event_external_id.
// Filters live in client state so toggling them never requires a roundtrip.
// The DataTable's globalFilter handles the free-text search; column filters
// handle Series + status flags.

type StatusFilter = "all" | "active" | "closed" | "archived";

export function ManualEventsTab({ data }: { data: ManualPayload }) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [series, setSeries] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusFilter>("all");

  const seriesOptions = useMemo(
    () =>
      data.knownSeries
        .map((s) => ({ value: String(s.id), label: s.slug, hint: `series#${s.id}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data.knownSeries],
  );

  const filtered = useMemo(() => {
    return data.rows.filter((row) => {
      if (series && String(row.series_id ?? "") !== series) return false;
      if (status === "active" && !row.active) return false;
      if (status === "closed" && !row.closed) return false;
      if (status === "archived" && !row.archived) return false;
      return true;
    });
  }, [data.rows, series, status]);

  const columns = useMemo<ColumnDef<ManualEventRow>[]>(
    () => [
      {
        id: "title",
        accessorKey: "title",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/events/${encodeURIComponent(row.original.external_id)}?from=events`}
            className="text-foreground hover:text-accent transition-colors font-medium truncate block max-w-[24rem]"
            title={row.original.title}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: "series",
        accessorKey: "series",
        header: "Series",
        cell: ({ row }) =>
          row.original.series ? (
            <span className="text-xs font-mono text-foreground-muted">
              {row.original.series}
            </span>
          ) : (
            <span className="text-xs text-foreground-muted">—</span>
          ),
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-foreground-muted whitespace-nowrap">
            {formatDate(row.original.created_at)}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "active",
        accessorFn: (row) => (row.active ? 1 : 0),
        header: "Active",
        cell: ({ row }) =>
          row.original.active ? (
            <Badge tone="success">active</Badge>
          ) : (
            <span className="text-foreground-muted text-xs">—</span>
          ),
      },
      {
        id: "closed",
        accessorFn: (row) => (row.closed ? 1 : 0),
        header: "Closed",
        cell: ({ row }) =>
          row.original.closed ? (
            <Badge tone="neutral">closed</Badge>
          ) : (
            <span className="text-foreground-muted text-xs">—</span>
          ),
      },
      {
        id: "market_count",
        accessorKey: "market_count",
        header: "Markets",
        cell: ({ row }) => (
          <span className="tabular-nums text-xs">{row.original.market_count}</span>
        ),
      },
      {
        id: "deployment",
        accessorKey: "deployment_status",
        header: "Deploy",
        cell: ({ row }) => (
          <Badge tone={tonalize(row.original.deployment_status)}>
            {row.original.deployment_status}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={globalFilter} onChange={setGlobalFilter} />
        <ComboSearch
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "closed", label: "Closed" },
            { value: "archived", label: "Archived" },
          ]}
          value={status}
          onChange={(v) => setStatus((v ?? "all") as StatusFilter)}
          ariaLabel="Status filter"
          triggerLabel={`Status: ${labelStatus(status)}`}
        />
        <ComboSearch
          options={[
            { value: "", label: "All series" },
            ...seriesOptions,
          ]}
          value={series ?? ""}
          onChange={(v) => setSeries(v && v !== "" ? v : undefined)}
          ariaLabel="Series filter"
          triggerLabel={
            series
              ? `Series: ${seriesOptions.find((s) => s.value === series)?.label ?? series}`
              : "Series: all"
          }
          clearable
        />
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        globalFilter={globalFilter}
        initialSorting={[{ id: "created_at", desc: true }]}
        emptyState={{
          title: "No manual events match",
          description: "Try clearing a filter or relaxing the search.",
        }}
      />
    </div>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex-1 min-w-[12rem]">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search title, series, or external_id…"
        className="w-full h-9 pl-8 pr-3 rounded-md border border-border bg-surface text-sm placeholder:text-foreground-muted/70 focus:outline-none focus:border-accent transition-colors"
        aria-label="Global search"
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

function labelStatus(s: StatusFilter): string {
  return s === "all" ? "all" : s;
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

function tonalize(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "info" {
  const s = status.toLowerCase();
  if (s.includes("deploy") && !s.includes("ing")) return "success";
  if (s.includes("registered") || s.includes("succeed") || s.includes("resolved")) return "success";
  if (s.includes("fail") || s.includes("cancel") || s.includes("refund")) return "danger";
  if (s.includes("wait") || s.includes("pending") || s.includes("paused")) return "warning";
  if (s.includes("running") || s.includes("submit") || s.includes("resolving") || s.includes("created") || s.includes("deploying")) return "info";
  return "neutral";
}
