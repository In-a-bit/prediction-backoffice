"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { EnrichedMarket } from "./page";
import { Badge, Card, CardBody, EmptyState, Stat } from "@/components/ui";
import { behaviors } from "@/lib/behaviors";
import {
  formatDateTime,
  formatPrice,
  formatRelative,
  shortId,
} from "@/lib/format";
import type { CreatedMarketStatus, Task } from "@/lib/types";

type StatusFilter = "all" | "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "VERIFYING", label: "Verifying" },
  { value: "VERIFIED", label: "Verified" },
  { value: "FAILED", label: "Failed" },
];

function uiStatus(m: EnrichedMarket): StatusFilter {
  if (m.status === "FAILED") return "FAILED";
  if (m.status === "PENDING") return "PENDING";
  if (m.status === "CREATED") return m.verified_at ? "VERIFIED" : "VERIFYING";
  return "PENDING";
}

export function MarketsBrowser({
  markets,
  tasks,
}: {
  markets: EnrichedMarket[];
  tasks: Task[];
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [taskId, setTaskId] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return markets.filter((m) => {
      if (status !== "all" && uiStatus(m) !== status) return false;
      if (taskId !== "all" && m.task_id.toString() !== taskId) return false;
      if (q) {
        const hay = [
          m.slug,
          m.market_external_id ?? "",
          m.event_external_id ?? "",
          m.task_asset_label,
          m.task_interval_label,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [markets, status, taskId, query]);

  const counts = useMemo(() => {
    const c = {
      total: markets.length,
      pending: 0,
      verifying: 0,
      verified: 0,
      failed: 0,
    };
    for (const m of markets) {
      const s = uiStatus(m);
      if (s === "PENDING") c.pending++;
      else if (s === "VERIFYING") c.verifying++;
      else if (s === "VERIFIED") c.verified++;
      else if (s === "FAILED") c.failed++;
    }
    return c;
  }, [markets]);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
            <Stat label="Total" value={counts.total} />
            <Stat
              label="Verified"
              value={counts.verified}
              tone="success"
            />
            <Stat
              label="Verifying"
              value={counts.verifying}
              tone={counts.verifying > 0 ? "info" : "neutral"}
            />
            <Stat
              label="Pending"
              value={counts.pending}
              tone={counts.pending > 0 ? "warning" : "neutral"}
            />
            <Stat
              label="Failed"
              value={counts.failed}
              tone={counts.failed > 0 ? "danger" : "neutral"}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <FilterLabel>Search</FilterLabel>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Slug, market id, asset…"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-4">
              <FilterLabel>Source task</FilterLabel>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className={inputClass}
              >
                <option value="all">All tasks ({tasks.length})</option>
                {tasks.map((t) => {
                  const label = t.asset
                    ? `${t.asset.display_name}/${t.asset.target.toUpperCase()} · ${t.interval?.label ?? ""}`
                    : `Task ${t.id}`;
                  return (
                    <option key={t.id} value={t.id.toString()}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="md:col-span-3">
              <FilterLabel>Status</FilterLabel>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>
              {filtered.length.toLocaleString()} of{" "}
              {markets.length.toLocaleString()} shown
            </span>
            {status !== "all" || taskId !== "all" || query ? (
              <button
                type="button"
                onClick={() => {
                  setStatus("all");
                  setTaskId("all");
                  setQuery("");
                }}
                className="hover:text-foreground underline underline-offset-2"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="No markets match these filters"
            description="Try widening the status or clearing the search."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-foreground-muted border-b border-border">
                  <th className="px-5 py-3 font-medium">Slot end</th>
                  <th className="px-3 py-3 font-medium">Behavior</th>
                  <th className="px-3 py-3 font-medium">Asset / Interval</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">priceToBeat</th>
                  <th className="px-3 py-3 font-medium">Slug</th>
                  <th className="px-5 py-3 font-medium">Market</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <MarketRow key={`${m.task_id}-${m.id}`} market={m} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent";

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1">
      {children}
    </div>
  );
}

function MarketRow({ market }: { market: EnrichedMarket }) {
  const b = behaviors[market.behavior_key];
  return (
    <tr className="border-b border-border last:border-0 hover:bg-foreground/[0.02]">
      <td className="px-5 py-2.5 whitespace-nowrap">
        <div className="font-medium">{formatDateTime(market.slot_end)}</div>
        <div className="text-xs text-foreground-muted">
          {formatRelative(market.slot_end)}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className="inline-flex items-center gap-1.5 text-xs text-foreground-muted"
          title={b.name}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: b.accent }}
          />
          {b.short}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Link
          href={`/automations/crypto-interval/${market.task_id}`}
          className="font-medium hover:text-accent"
        >
          {market.task_asset_label}
        </Link>
        <div className="text-xs text-foreground-muted">
          {market.task_interval_label}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge market={market} />
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

function StatusBadge({ market }: { market: EnrichedMarket }) {
  if (market.status === "FAILED") return <Badge tone="danger">FAILED</Badge>;
  if (market.status === "PENDING") return <Badge tone="warning">PENDING</Badge>;
  if (market.status === "CREATED") {
    return market.verified_at ? (
      <Badge tone="success">VERIFIED</Badge>
    ) : (
      <Badge tone="info">VERIFYING</Badge>
    );
  }
  return <Badge tone="neutral">{market.status as CreatedMarketStatus}</Badge>;
}
