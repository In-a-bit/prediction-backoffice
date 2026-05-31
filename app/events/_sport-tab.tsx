"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ComboSearch } from "@/components/combo-search";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui";

import type { SportEventRow, SportPayload } from "./_types";

// Sport events tab — one row per upstream fixture across the configured
// sport tasks. Filters: sport (combo), league, country, fixture status.

export function SportEventsTab({ data }: { data: SportPayload }) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sport, setSport] = useState<string | undefined>();
  const [country, setCountry] = useState<string | undefined>();
  const [league, setLeague] = useState<string | undefined>();
  const [statusShort, setStatusShort] = useState<string | undefined>();

  const sportOptions = useMemo(
    () => uniqueOptions(data.rows.map((r) => r.sport)),
    [data.rows],
  );
  const countryOptions = useMemo(
    () => uniqueOptions(data.rows.map((r) => r.country)),
    [data.rows],
  );
  const leagueOptions = useMemo(() => {
    // Filter leagues by the chosen country/sport so the dropdown shrinks
    // contextually — same UX trick as /events?source=crypto with task scoping.
    return uniqueOptions(
      data.rows
        .filter((r) => (sport ? r.sport === sport : true))
        .filter((r) => (country ? r.country === country : true))
        .map((r) => r.league),
    );
  }, [data.rows, sport, country]);
  const statusOptions = useMemo(
    () => uniqueOptions(data.rows.map((r) => r.fixture_status_short)),
    [data.rows],
  );

  const filtered = useMemo(() => {
    return data.rows.filter((row) => {
      if (sport && row.sport !== sport) return false;
      if (country && row.country !== country) return false;
      if (league && row.league !== league) return false;
      if (statusShort && row.fixture_status_short !== statusShort) return false;
      return true;
    });
  }, [data.rows, sport, country, league, statusShort]);

  const columns = useMemo<ColumnDef<SportEventRow>[]>(
    () => [
      {
        id: "sport",
        accessorKey: "sport",
        header: "Sport",
        cell: ({ row }) => (
          <span className="text-xs">{capitalize(row.original.sport)}</span>
        ),
      },
      {
        id: "country",
        accessorKey: "country",
        header: "Country",
        cell: ({ row }) => (
          <span className="text-xs text-foreground-muted">
            {row.original.country}
          </span>
        ),
      },
      {
        id: "league",
        accessorKey: "league",
        header: "League",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.league}</span>
        ),
      },
      {
        id: "match",
        accessorKey: "match",
        header: "Match",
        cell: ({ row }) => (
          <Link
            href={`/events/${encodeURIComponent(row.original.event_external_id)}?from=events`}
            className="text-foreground hover:text-accent transition-colors font-medium truncate block max-w-[20rem]"
            title={row.original.match}
          >
            {row.original.match}
          </Link>
        ),
      },
      {
        id: "kickoff_at",
        accessorKey: "kickoff_at",
        header: "Kickoff",
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap">
            {formatTime(row.original.kickoff_at)}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "fixture_status_short",
        accessorKey: "fixture_status_short",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={statusTone(row.original.fixture_status_short)}>
            {row.original.fixture_status_short || "—"}
          </Badge>
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
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={globalFilter} onChange={setGlobalFilter} />
        <ComboSearch
          options={[{ value: "", label: "All sports" }, ...sportOptions]}
          value={sport ?? ""}
          onChange={(v) => setSport(v && v !== "" ? v : undefined)}
          ariaLabel="Sport filter"
          triggerLabel={sport ? `Sport: ${sport}` : "Sport: all"}
          clearable
        />
        <ComboSearch
          options={[{ value: "", label: "All countries" }, ...countryOptions]}
          value={country ?? ""}
          onChange={(v) => {
            setCountry(v && v !== "" ? v : undefined);
            setLeague(undefined);
          }}
          ariaLabel="Country filter"
          triggerLabel={country ? `Country: ${country}` : "Country: all"}
          clearable
        />
        <ComboSearch
          options={[{ value: "", label: "All leagues" }, ...leagueOptions]}
          value={league ?? ""}
          onChange={(v) => setLeague(v && v !== "" ? v : undefined)}
          ariaLabel="League filter"
          triggerLabel={league ? `League: ${league}` : "League: all"}
          clearable
        />
        <ComboSearch
          options={[{ value: "", label: "All statuses" }, ...statusOptions]}
          value={statusShort ?? ""}
          onChange={(v) => setStatusShort(v && v !== "" ? v : undefined)}
          ariaLabel="Status filter"
          triggerLabel={statusShort ? `Status: ${statusShort}` : "Status: all"}
          clearable
        />
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        globalFilter={globalFilter}
        initialSorting={[{ id: "kickoff_at", desc: true }]}
        emptyState={{
          title: "No sport events match",
          description: "Adjust the filters or pick a different league.",
        }}
      />
    </div>
  );
}

function uniqueOptions(values: string[]): { value: string; label: string }[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v && v !== "—") set.add(v);
  }
  return [...set]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));
}

function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "info" {
  const s = status.toUpperCase();
  // Match api-football fixture status short codes.
  if (s === "FT" || s === "AET" || s === "PEN" || s === "AWD") return "success";
  if (s === "1H" || s === "2H" || s === "ET" || s === "BT" || s === "P" || s === "LIVE") return "info";
  if (s === "HT") return "info";
  if (s === "PST" || s === "CANC" || s === "ABD") return "danger";
  if (s === "SUSP" || s === "INT") return "warning";
  return "neutral";
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
        placeholder="Search match, league, country…"
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

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
