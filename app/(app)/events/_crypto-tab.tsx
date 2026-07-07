"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ComboSearch } from "@/components/combo-search";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui";

import type { CryptoEventRow, CryptoPayload } from "./_types";

// Crypto events tab — one row per CryptoEvent (slot). Free-text search
// updates the URL so the server re-fetches all tasks on next navigation.

type StateFilter = "all" | "pending" | "up" | "down" | "skipped";

export function CryptoEventsTab({
  data,
  initialQ = "",
}: {
  data: CryptoPayload;
  initialQ?: string;
}) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [globalFilter, setGlobalFilter] = useState(initialQ);
  const [asset, setAsset] = useState<string | undefined>();
  const [interval, setInterval] = useState<string | undefined>();
  const [state, setState] = useState<StateFilter>("all");

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

  const assetOptions = useMemo(
    () =>
      data.assets
        .map((a) => ({
          value: a.display_name ?? a.base,
          label: a.display_name ?? a.base,
          hint: a.is_active ? undefined : "inactive",
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data.assets],
  );
  const intervalOptions = useMemo(
    () =>
      data.intervals
        .map((i) => ({ value: i.label, label: i.label, hint: `${i.minutes}m` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data.intervals],
  );

  const filtered = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (q) {
        const matches =
          row.asset?.toLowerCase().includes(q) ||
          row.interval?.toLowerCase().includes(q) ||
          row.event_external_id?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (asset && row.asset !== asset) return false;
      if (interval && row.interval !== interval) return false;
      if (state === "pending" && row.outcome !== null) return false;
      if (state === "up" && row.outcome !== "up") return false;
      if (state === "down" && row.outcome !== "down") return false;
      if (state === "skipped" && !row.is_skipped) return false;
      return true;
    });
  }, [data.rows, globalFilter, asset, interval, state]);

  const columns = useMemo<ColumnDef<CryptoEventRow>[]>(
    () => [
      {
        id: "asset",
        accessorKey: "asset",
        header: "Asset",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.asset}</span>
        ),
      },
      {
        id: "interval",
        accessorKey: "interval",
        header: "Interval",
        cell: ({ row }) => (
          <span className="text-xs text-foreground-muted">
            {row.original.interval}
          </span>
        ),
      },
      {
        id: "slot_start",
        accessorKey: "slot_start",
        header: "Slot start",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">
            {formatTime(row.original.slot_start)}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "slot_end",
        accessorKey: "slot_end",
        header: "Slot end",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">
            {formatTime(row.original.slot_end)}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "price_to_beat",
        accessorKey: "price_to_beat",
        header: "Price to beat",
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-xs text-right block">
            {formatPrice(row.original.price_to_beat)}
          </span>
        ),
      },
      {
        id: "price_at_close",
        accessorKey: "price_at_close",
        header: "Price at close",
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-xs text-right block">
            {formatPrice(row.original.price_at_close)}
          </span>
        ),
      },
      {
        id: "outcome",
        accessorKey: "outcome",
        header: "Outcome",
        cell: ({ row }) => <OutcomeChip row={row.original} />,
      },
      {
        id: "market_count",
        accessorKey: "market_count",
        header: "Markets",
        cell: ({ row }) => (
          <span className="tabular-nums text-xs">{row.original.market_count}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={globalFilter} onChange={handleSearch} />
        <ComboSearch
          options={[{ value: "", label: "All assets" }, ...assetOptions]}
          value={asset ?? ""}
          onChange={(v) => setAsset(v && v !== "" ? v : undefined)}
          ariaLabel="Asset filter"
          triggerLabel={asset ? `Asset: ${asset}` : "Asset: all"}
          clearable
        />
        <ComboSearch
          options={[{ value: "", label: "All intervals" }, ...intervalOptions]}
          value={interval ?? ""}
          onChange={(v) => setInterval(v && v !== "" ? v : undefined)}
          ariaLabel="Interval filter"
          triggerLabel={interval ? `Interval: ${interval}` : "Interval: all"}
          clearable
        />
        <ComboSearch
          options={[
            { value: "all", label: "All outcomes" },
            { value: "pending", label: "Pending" },
            { value: "up", label: "Up" },
            { value: "down", label: "Down" },
            { value: "skipped", label: "Skipped" },
          ]}
          value={state}
          onChange={(v) => setState((v ?? "all") as StateFilter)}
          ariaLabel="State filter"
          triggerLabel={`State: ${state}`}
        />
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        initialSorting={[{ id: "slot_end", desc: true }]}
        emptyState={{
          title: "No crypto events match",
          description: "Try a different asset/interval or clear the search.",
        }}
      />
    </div>
  );
}

function OutcomeChip({ row }: { row: CryptoEventRow }) {
  if (row.is_skipped)
    return <Badge tone="neutral">skipped</Badge>;
  if (row.outcome === "up") return <Badge tone="success">up</Badge>;
  if (row.outcome === "down") return <Badge tone="danger">down</Badge>;
  return <Badge tone="info">pending</Badge>;
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
        placeholder="Search asset / external_id…"
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

function formatTime(iso: string): string {
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

function formatPrice(s: string | null | undefined): string {
  if (!s) return "—";
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}
