import Link from "next/link";

import { Pagination } from "@/components/pagination";
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

import { RetryLogButton } from "./retry-button";

export const dynamic = "force-dynamic";

// Source partitions every operator-log row by the family of action it
// records.
//   - sports: action starts with "sports_" or "uma_"
//   - crypto: action starts with "crypto_" or equals "ctf_report_payouts"
//   - manual: everything else (create_series, create_event, create_market, …)
// "all" disables the partition.
type Source = "all" | "manual" | "sports" | "crypto";

function classifySource(action: string): Exclude<Source, "all"> {
  if (action.startsWith("sports_") || action.startsWith("uma_")) return "sports";
  if (action.startsWith("crypto_") || action === "ctf_report_payouts") return "crypto";
  return "manual";
}

const DEFAULT_PER_PAGE = 25;
function clampPerPage(n: number): number {
  return [10, 25, 50, 100].includes(n) ? n : DEFAULT_PER_PAGE;
}

type SearchParams = {
  source?: string;
  resource_type?: string;
  action?: string;
  actor?: string;
  correlation_id?: string;
  status?: string;
  limit?: string;
  page?: string;
  per_page?: string;
};

export default async function OperatorLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const source: Source =
    sp.source === "manual" || sp.source === "sports" || sp.source === "crypto"
      ? sp.source
      : "all";

  const perPage = clampPerPage(Number(sp.per_page) || DEFAULT_PER_PAGE);
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * perPage;

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
  if (sp.status) filters.status = sp.status as OperatorLogEntry["status"];

  let entries: OperatorLogEntry[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const result = await manual.listOperatorLog({ ...filters, limit: perPage, offset });
    entries = result.data;
    total = result.total;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Source partition is applied after fetch — the backend doesn't filter by action
  // family, so we filter client-side on the current page.
  const filteredEntries =
    source === "all" ? entries : entries.filter((e) => classifySource(e.action) === source);

  const paginationBasePath = (() => {
    const q = new URLSearchParams();
    if (source !== "all") q.set("source", source);
    if (sp.resource_type) q.set("resource_type", sp.resource_type);
    if (sp.action) q.set("action", sp.action);
    if (sp.actor) q.set("actor", sp.actor);
    if (sp.correlation_id) q.set("correlation_id", sp.correlation_id);
    if (sp.status) q.set("status", sp.status);
    const qs = q.toString();
    return `/operator-log${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title="Operator log"
        description="Cross-cutting audit trail for every write the backoffice makes — manual creator actions, sports automations, UMA propose/resolve, and operator overrides."
      />

      <SourceTabs current={source} sp={sp} />
      <FilterBar source={source} filters={filters} />

      {error ? (
        <Card>
          <CardBody className="text-sm text-danger">{error}</CardBody>
        </Card>
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          title="No log entries"
          description={
            source === "all"
              ? "Create a series, event, market, or league config and it will appear here."
              : `No ${source} actions match the current filter.`
          }
        />
      ) : (
        <>
          <Card>
            <Pagination total={total} page={page} perPage={perPage} basePath={paginationBasePath} />
          </Card>
          <ul className="space-y-2">
            {filteredEntries.map((e) => (
              <LogRow key={e.id} entry={e} />
            ))}
          </ul>
          <Card>
            <Pagination total={total} page={page} perPage={perPage} basePath={paginationBasePath} />
          </Card>
        </>
      )}
    </div>
  );
}

// SourceTabs renders three pill buttons that swap the `source` query
// param while preserving every other filter. Server-rendered links — no
// client component needed.
function SourceTabs({ current, sp }: { current: Source; sp: SearchParams }) {
  const tabs: { key: Source; label: string }[] = [
    { key: "all", label: "All" },
    { key: "manual", label: "Manual" },
    { key: "sports", label: "Sports" },
    { key: "crypto", label: "Crypto" },
  ];
  return (
    <div className="flex items-center gap-2">
      {tabs.map((t) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (k === "source" || v === undefined || v === "") continue;
          params.set(k, String(v));
        }
        if (t.key !== "all") params.set("source", t.key);
        const qs = params.toString();
        const active = current === t.key;
        return (
          <Link
            key={t.key}
            href={`/operator-log${qs ? `?${qs}` : ""}`}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              active
                ? "bg-foreground text-background border-foreground"
                : "border-border text-foreground-muted hover:text-foreground hover:bg-foreground/[0.04]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function FilterBar({ source, filters }: { source: Source; filters: OperatorLogFilters }) {
  const types = ["", "series", "event", "market"] as const;
  return (
    <Card>
      <CardBody>
        <form className="flex flex-wrap gap-2 items-end" method="get">
          {/* Preserve source across form submits via hidden input. */}
          {source !== "all" && <input type="hidden" name="source" value={source} />}
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
              placeholder={
                source === "sports"
                  ? "uma_propose"
                  : source === "crypto"
                    ? "ctf_report_payouts"
                    : "create_market"
              }
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            actor
            <input
              type="text"
              name="actor"
              defaultValue={filters.actor ?? ""}
              placeholder="sports-auto"
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
  const source = classifySource(entry.action);
  return (
    <li>
      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge tone={tone}>{entry.status}</Badge>
            <Badge
              tone={
                source === "sports"
                  ? "info"
                  : source === "crypto"
                    ? "warning"
                    : "neutral"
              }
            >
              {source}
            </Badge>
            <span className="text-sm font-medium">{entry.action}</span>
            <span className="text-xs text-foreground-muted">· {entry.resource_type}</span>
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
                href={`/operator-log?correlation_id=${entry.correlation_id}`}
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
          {entry.error ? <div className="text-danger">error: {entry.error}</div> : null}
          {entry.status === "failed" &&
          (entry.action === "create_series" || entry.action === "create_event") ? (
            <div className="pt-2">
              <RetryLogButton externalId={entry.external_id} />
            </div>
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
