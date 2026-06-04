"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ComboSearch } from "@/components/combo-search";
import { DataTable } from "@/components/data-table";
import { Badge, buttonVariants } from "@/components/ui";
import {
  LOCAL_BUCKET_LABEL,
  type LocalBucket,
} from "@/lib/aggregations";
import type { MarketRow } from "@/lib/market-rows";
import type { OperatorLogEntry } from "@/lib/types";

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
        id: "local_status",
        accessorKey: "local_status",
        header: "Status",
        cell: ({ row }) => (
          <LocalStatusChip
            localStatus={row.original.local_status}
            source={row.original.source}
            umaStatus={row.original.uma_resolution_status}
          />
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
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => <ActionButton row={row.original} />,
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
          {filtered.length} markets —{" "}
          {LOCAL_BUCKET_LABEL[tab as LocalBucket] ?? tab}
        </span>
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        globalFilter={globalFilter}
        initialSorting={[{ id: "created_at", desc: true }]}
        emptyState={{
          title: "No markets in this state",
          description:
            "Markets will appear here as they transition into this state.",
        }}
      />
    </div>
  );
}

function ActionButton({ row }: { row: MarketRow }) {
  const ls = row.local_status;
  const href = openHref(row);

  let label = "Open →";
  let variant: keyof typeof buttonVariants = "secondary";

  if (ls === "created" || ls === "first_time_disputed") {
    label = "Propose →";
    variant = "primary";
  } else if (ls === "disputed") {
    label = "Watch →";
    variant = "primary";
  } else if (ls === "proposed") {
    label = "Inspect →";
    variant = "secondary";
  } else if (ls === "failed") {
    label = "Debug →";
    variant = "danger";
  }

  return (
    <Link href={href} className={buttonVariants[variant]}>
      {label}
    </Link>
  );
}

function LocalStatusChip({
  localStatus,
  source,
  umaStatus,
}: {
  localStatus: string | null;
  source: string;
  umaStatus?: string | null;
}) {
  const display =
    localStatus ??
    (source === "manual" && umaStatus ? umaStatus.toLowerCase() : null);

  if (!display) {
    return <span className="text-xs text-foreground-muted">—</span>;
  }

  const tone =
    display === "disputed" || display === "first_time_disputed"
      ? "danger"
      : display === "resolved" || display === "refunded"
        ? "success"
        : display === "proposed" || display === "proposing"
          ? "info"
          : display === "failed" || display === "cancelled"
            ? "warning"
            : "neutral";

  const label =
    LOCAL_BUCKET_LABEL[display as LocalBucket] ??
    display.replace(/_/g, " ");

  return <Badge tone={tone}>{label}</Badge>;
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
