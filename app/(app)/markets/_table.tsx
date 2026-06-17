"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ComboSearch } from "@/components/combo-search";
import { DataTable } from "@/components/data-table";
import { ResultChip } from "@/components/market-lifecycle";
import { Badge } from "@/components/ui";

import type { MarketRow, MarketsPayload } from "./_types";

// MarketsTable — single wide DataTable for the full inventory. Filters live
// in client state; URL-driven source tabs already scope server-side.
//
// Columns:
//   Source · Name · Created · Event · Active · Closed · Accepting
//   · Accept since · Status · Closed time · Result

type AcceptFilter = "any" | "open" | "pending" | "closed";
type FlagFilter = "any" | "yes" | "no";

export function MarketsTable({ data, initialQ = "" }: { data: MarketsPayload; initialQ?: string }) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [globalFilter, setGlobalFilter] = useState(initialQ);
  const [umaStatus, setUmaStatus] = useState<string | undefined>();

  function handleSearch(v: string) {
    setGlobalFilter(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const sp = new URLSearchParams(window.location.search);
      if (v.trim()) sp.set("q", v.trim());
      else sp.delete("q");
      router.replace(`${window.location.pathname}?${sp.toString()}`);
    }, 400);
  }
  const [accepting, setAccepting] = useState<AcceptFilter>("any");
  const [activeFilter, setActiveFilter] = useState<FlagFilter>("any");
  const [closedFilter, setClosedFilter] = useState<FlagFilter>("any");

  const filtered = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (q) {
        const matches =
          row.question?.toLowerCase().includes(q) ||
          row.event_title?.toLowerCase().includes(q) ||
          row.market_external_id?.toLowerCase().includes(q) ||
          row.event_external_id?.toLowerCase().includes(q) ||
          row.series_slug?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (umaStatus && row.uma_resolution_status !== umaStatus) return false;
      if (accepting !== "any" && row.accepting !== accepting) return false;
      if (activeFilter !== "any") {
        const want = activeFilter === "yes";
        if ((row.active ?? false) !== want) return false;
      }
      if (closedFilter !== "any") {
        const want = closedFilter === "yes";
        if ((row.closed ?? false) !== want) return false;
      }
      return true;
    });
  }, [data.rows, globalFilter, umaStatus, accepting, activeFilter, closedFilter]);

  const umaOptions = useMemo(() => {
    const statuses = new Set<string>();
    for (const r of data.rows) if (r.uma_resolution_status) statuses.add(r.uma_resolution_status);
    return [
      { value: "", label: "All statuses" },
      ...[...statuses].map((s) => ({ value: s, label: s })),
    ];
  }, [data.rows]);

  const columns = useMemo<ColumnDef<MarketRow>[]>(
    () => [
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
        id: "question",
        accessorKey: "question",
        header: "Name",
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
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-foreground-muted">
            {formatDate(row.original.created_at)}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "event_title",
        accessorKey: "event_title",
        header: "Event",
        cell: ({ row }) =>
          row.original.event_title ? (
            <Link
              href={`/events/${encodeURIComponent(row.original.event_external_id ?? "")}?from=markets`}
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
        id: "active",
        accessorFn: (row) => (row.active ? 1 : 0),
        header: "Active",
        cell: ({ row }) => <BoolFlag value={row.original.active} tone="success" label="active" />,
      },
      {
        id: "closed",
        accessorFn: (row) => (row.closed ? 1 : 0),
        header: "Closed",
        cell: ({ row }) => <BoolFlag value={row.original.closed} tone="neutral" label="closed" />,
      },
      {
        id: "accepting",
        accessorKey: "accepting",
        header: "Accepting",
        cell: ({ row }) => <AcceptingChip value={row.original.accepting} />,
      },
      {
        id: "accepting_orders_at",
        accessorKey: "accepting_orders_at",
        header: "Accept since",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-foreground-muted">
            {row.original.accepting_orders_at
              ? formatDate(row.original.accepting_orders_at)
              : "—"}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "uma_resolution_status",
        accessorKey: "uma_resolution_status",
        header: "Status",
        cell: ({ row }) => <StatusChip value={row.original.uma_resolution_status} />,
      },
      {
        id: "closed_time",
        accessorKey: "closed_time",
        header: "Closed time",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-foreground-muted">
            {row.original.closed_time ? formatDate(row.original.closed_time) : "—"}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "result",
        header: "Result",
        enableSorting: false,
        cell: ({ row }) => <ResultChip result={row.original.result} />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={globalFilter} onChange={handleSearch} />
        <ComboSearch
          options={umaOptions}
          value={umaStatus ?? ""}
          onChange={(v) => setUmaStatus(v && v !== "" ? v : undefined)}
          ariaLabel="Status filter"
          triggerLabel={umaStatus ? `Status: ${umaStatus}` : "Status: all"}
          clearable
        />
        <ComboSearch
          options={[
            { value: "any", label: "Any" },
            { value: "open", label: "Accepting orders" },
            { value: "pending", label: "Pending acceptance" },
            { value: "closed", label: "Not accepting" },
          ]}
          value={accepting}
          onChange={(v) => setAccepting((v ?? "any") as AcceptFilter)}
          ariaLabel="Accepting filter"
          triggerLabel={`Accept: ${accepting === "any" ? "all" : accepting}`}
        />
        <ComboSearch
          options={[
            { value: "any", label: "Active: any" },
            { value: "yes", label: "Active: yes" },
            { value: "no", label: "Active: no" },
          ]}
          value={activeFilter}
          onChange={(v) => setActiveFilter((v ?? "any") as FlagFilter)}
          ariaLabel="Active filter"
          triggerLabel={`Active: ${activeFilter === "any" ? "any" : activeFilter}`}
        />
        <ComboSearch
          options={[
            { value: "any", label: "Closed: any" },
            { value: "yes", label: "Closed: yes" },
            { value: "no", label: "Closed: no" },
          ]}
          value={closedFilter}
          onChange={(v) => setClosedFilter((v ?? "any") as FlagFilter)}
          ariaLabel="Closed filter"
          triggerLabel={`Closed: ${closedFilter === "any" ? "any" : closedFilter}`}
        />
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        initialSorting={[{ id: "created_at", desc: true }]}
        emptyState={{
          title: "No markets match",
          description: "Try a different source tab or relax the filters.",
        }}
        footer={({ totalRows, visibleRows }) => (
          <span>
            {visibleRows} of {totalRows} markets shown · hydrated fields are limited
            to the first ~60 rows for speed
          </span>
        )}
      />
    </div>
  );
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
  params.set("from", "markets");
  return `/markets/${encodeURIComponent(row.market_external_id)}?${params.toString()}`;
}

function BoolFlag({
  value,
  tone,
  label,
}: {
  value: boolean | null;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
}) {
  if (value === null) return <span className="text-xs text-foreground-muted">…</span>;
  if (!value) return <span className="text-xs text-foreground-muted">—</span>;
  return <Badge tone={tone}>{label}</Badge>;
}

function AcceptingChip({ value }: { value: MarketRow["accepting"] }) {
  if (value === null) return <span className="text-xs text-foreground-muted">…</span>;
  if (value === "open") return <Badge tone="success">open</Badge>;
  if (value === "pending") return <Badge tone="warning">pending</Badge>;
  return <Badge tone="neutral">closed</Badge>;
}

function StatusChip({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-foreground-muted">—</span>;
  const lower = value.toLowerCase();
  const tone =
    lower.includes("disput")
      ? "danger"
      : lower === "resolved" || lower === "manually_resolved"
        ? "success"
        : lower.includes("propos")
          ? "info"
          : lower.includes("challenge")
            ? "warning"
            : "neutral";
  return <Badge tone={tone}>{value}</Badge>;
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
        placeholder="Search question, event title, external_id…"
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
