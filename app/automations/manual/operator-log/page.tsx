import Link from "next/link";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { manual } from "@/lib/api";
import { formatDateTimeFull } from "@/lib/format";
import type { OperatorLogEntry, OperatorLogFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = {
  resource_type?: string;
  action?: string;
  actor?: string;
  correlation_id?: string;
  status?: string;
  limit?: string;
};

export default async function OperatorLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters: OperatorLogFilters = {};
  if (
    sp.resource_type === "series" ||
    sp.resource_type === "event" ||
    sp.resource_type === "market"
  )
    filters.resource_type = sp.resource_type;
  if (sp.action) filters.action = sp.action as OperatorLogFilters["action"];
  if (sp.actor) filters.actor = sp.actor;
  if (sp.correlation_id) filters.correlation_id = sp.correlation_id;
  if (sp.status) filters.status = sp.status as OperatorLogFilters["status"];
  if (sp.limit) filters.limit = Number(sp.limit);

  let entries: OperatorLogEntry[] = [];
  let error: string | null = null;
  try {
    entries = await manual.listOperatorLog(filters);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Operator log"
        description="Audit trail for every manual write — series, events, markets, signal-balance calls, and recreate attempts."
        actions={
          <Link href="/automations/manual" className={buttonVariants.ghost}>
            Back to hub
          </Link>
        }
      />

      <FilterBar filters={filters} />

      {error ? (
        <Card>
          <CardBody className="text-sm text-danger">{error}</CardBody>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No log entries"
          description="Create a series, event, or market and it will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <LogRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterBar({ filters }: { filters: OperatorLogFilters }) {
  const types = ["", "series", "event", "market"] as const;
  return (
    <Card>
      <CardBody>
        <form className="flex flex-wrap gap-2 items-end" method="get">
          <label className="flex flex-col gap-1 text-xs">
            resource_type
            <select
              name="resource_type"
              defaultValue={filters.resource_type ?? ""}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t || "(any)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            action
            <input
              type="text"
              name="action"
              defaultValue={filters.action ?? ""}
              placeholder="create_market"
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            correlation_id
            <input
              type="text"
              name="correlation_id"
              defaultValue={filters.correlation_id ?? ""}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-mono w-72"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            status
            <input
              type="text"
              name="status"
              defaultValue={filters.status ?? ""}
              placeholder="failed"
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            />
          </label>
          <button type="submit" className={buttonVariants.secondary}>
            Filter
          </button>
        </form>
      </CardBody>
    </Card>
  );
}

function LogRow({ entry }: { entry: OperatorLogEntry }) {
  const tone =
    entry.status === "succeeded"
      ? "success"
      : entry.status === "failed"
        ? "danger"
        : entry.status === "waiting_for_balance"
          ? "warning"
          : entry.status === "running" || entry.status === "submitted"
            ? "info"
            : "neutral";
  return (
    <li>
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge tone={tone}>{entry.status}</Badge>
            <span className="text-sm font-medium">{entry.action}</span>
            <span className="text-xs text-foreground-muted">
              · {entry.resource_type}
            </span>
            {entry.resource_external_id ? (
              <span className="text-[11px] text-foreground-muted font-mono truncate">
                · {entry.resource_external_id}
              </span>
            ) : null}
          </div>
          <span className="text-[11px] text-foreground-muted shrink-0">
            {formatDateTimeFull(entry.created_at)} · {entry.actor}
          </span>
        </CardHeader>
        <CardBody className="text-xs space-y-1">
          {entry.workflow_id ? (
            <div className="font-mono">workflow: {entry.workflow_id}</div>
          ) : null}
          {entry.correlation_id ? (
            <div>
              <Link
                href={`/automations/manual/operator-log?correlation_id=${entry.correlation_id}`}
                className="font-mono underline"
              >
                correlation: {entry.correlation_id}
              </Link>
            </div>
          ) : null}
          {entry.parent_log_id ? (
            <div className="font-mono text-foreground-muted">
              recreated from: {entry.parent_log_id}
            </div>
          ) : null}
          {entry.error ? (
            <div className="text-danger">error: {entry.error}</div>
          ) : null}
          {entry.resource_type === "event" && entry.resource_external_id ? (
            <div className="pt-1">
              <Link
                href={`/automations/manual/events/${entry.resource_external_id}/markets/new`}
                className="text-accent hover:underline"
              >
                Add markets to this event →
              </Link>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </li>
  );
}
