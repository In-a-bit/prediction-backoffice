"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { DerivedEvent } from "./page";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { Task } from "@/lib/types";

type Linkage = "all" | "linked" | "synthetic";

export function EventsBrowser({
  events,
  tasks,
}: {
  events: DerivedEvent[];
  tasks: Task[];
}) {
  const [taskId, setTaskId] = useState<string>("all");
  const [linkage, setLinkage] = useState<Linkage>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (
        taskId !== "all" &&
        !e.task_ids.includes(Number.parseInt(taskId, 10))
      )
        return false;
      if (linkage === "linked" && !e.event_external_id) return false;
      if (linkage === "synthetic" && e.event_external_id) return false;
      if (q) {
        const hay = [
          e.event_external_id ?? "",
          e.task_asset_label,
          e.task_interval_label,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, taskId, linkage, query]);

  const linkedCount = events.filter((e) => e.event_external_id).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <FilterLabel>Search</FilterLabel>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Event id, asset…"
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
              <FilterLabel>Linkage</FilterLabel>
              <select
                value={linkage}
                onChange={(e) => setLinkage(e.target.value as Linkage)}
                className={inputClass}
              >
                <option value="all">All ({events.length})</option>
                <option value="linked">With event id ({linkedCount})</option>
                <option value="synthetic">
                  Synthetic ({events.length - linkedCount})
                </option>
              </select>
            </div>
          </div>
          <div className="text-xs text-foreground-muted">
            {filtered.length.toLocaleString()} of{" "}
            {events.length.toLocaleString()} shown
          </div>
        </CardBody>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="No events match"
            description="Adjust filters or clear the search to see results."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-foreground-muted border-b border-border">
                  <th className="px-5 py-3 font-medium">Event</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium">Markets</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">First slot</th>
                  <th className="px-5 py-3 font-medium">Last slot</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <EventRow key={e.key} event={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function EventRow({ event }: { event: DerivedEvent }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-foreground/[0.02]">
      <td className="px-5 py-3">
        {event.event_external_id ? (
          <code className="text-xs text-foreground font-medium">
            {event.event_external_id.slice(0, 14)}
            {event.event_external_id.length > 14 ? "…" : ""}
          </code>
        ) : (
          <span className="text-xs text-foreground-muted italic">
            synthetic
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        {event.task_ids.length === 1 ? (
          <Link
            href={`/automations/crypto-interval/${event.task_ids[0]}`}
            className="hover:text-accent"
          >
            <div className="font-medium">{event.task_asset_label}</div>
            <div className="text-xs text-foreground-muted">
              {event.task_interval_label}
            </div>
          </Link>
        ) : (
          <div>
            <div className="font-medium">{event.task_asset_label}</div>
            <div className="text-xs text-foreground-muted">
              spans {event.task_ids.length} tasks
            </div>
          </div>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums">{event.market_count}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {event.statuses.verified > 0 ? (
            <Badge tone="success">{event.statuses.verified} ✓</Badge>
          ) : null}
          {event.statuses.verifying > 0 ? (
            <Badge tone="info">{event.statuses.verifying} verifying</Badge>
          ) : null}
          {event.statuses.pending > 0 ? (
            <Badge tone="warning">{event.statuses.pending} pending</Badge>
          ) : null}
          {event.statuses.failed > 0 ? (
            <Badge tone="danger">{event.statuses.failed} failed</Badge>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-foreground-muted text-xs">
        <div>{formatDateTime(event.first_slot_end)}</div>
        <div>{formatRelative(event.first_slot_end)}</div>
      </td>
      <td className="px-5 py-3 text-foreground-muted text-xs">
        <div>{formatDateTime(event.last_slot_end)}</div>
        <div>{formatRelative(event.last_slot_end)}</div>
      </td>
    </tr>
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
