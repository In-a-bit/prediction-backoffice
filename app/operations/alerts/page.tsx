import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui";
import { listAlerts, countAlerts } from "@/lib/observability/store";
import type {
  AlertFilters,
  AlertSeverity,
  AlertSource,
  OperatorAlert,
} from "@/lib/observability/types";

import { AckButton } from "./ack-button";

export const dynamic = "force-dynamic";

type AcknowledgedFilter = "any" | "open" | "acked";
type SortKey = "time" | "severity";
type SortDir = "asc" | "desc";

const SEVERITIES: AlertSeverity[] = ["error", "warning", "info"];
const SOURCES: AlertSource[] = ["manual", "crypto", "sport", "dpm", "ui", "system"];
const ENTITIES = ["market", "event", "series", "task", "deploy_plan"] as const;

// /operations/alerts — Postgres-backed (with in-memory fallback) feed of every
// captured server-side error and operator notable. Layout matches the
// alerts-a v2 canvas: KPI strip → filter card → sortable table with per-row
// ack button + entity column.

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const severity = pickEnum(sp.severity, SEVERITIES);
  const source = pickEnum(sp.source, SOURCES);
  const entity = pickEnum(sp.entity, [...ENTITIES, "none"] as const);
  const state: AcknowledgedFilter = pickEnum(sp.state, ["any", "open", "acked"] as const) ?? "open";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const [sortKey, sortDir] = readSort(sp.sort);

  const filters: AlertFilters = {
    severity,
    source,
    resource_type: entity === "none" ? undefined : entity,
    q,
    acknowledged:
      state === "open" ? false : state === "acked" ? true : undefined,
    limit: 200,
  };

  const [rows, counts] = await Promise.all([
    listAlerts(filters),
    countAlerts({}),
  ]);

  const sorted = sortAlerts(rows, sortKey, sortDir);

  const baseQS = (overrides: Record<string, string | undefined>) =>
    buildQuery({
      severity,
      source,
      entity,
      state,
      q,
      sort: encodeSort(sortKey, sortDir),
      ...overrides,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operator alerts"
        description="Every error, warning, and notable event captured by the backoffice. Persisted via the prediction-bundler — the in-process buffer is the fallback while the endpoints roll out."
        actions={<AutoRefresh label="Live" intervalMs={20_000} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <Stat
              label="Errors"
              value={counts.by_severity.error}
              tone={counts.by_severity.error > 0 ? "danger" : "neutral"}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Warnings"
              value={counts.by_severity.warning}
              tone={counts.by_severity.warning > 0 ? "warning" : "neutral"}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Unacknowledged"
              value={counts.unacknowledged}
              tone={counts.unacknowledged > 0 ? "info" : "neutral"}
              hint="open in feed"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Total stored" value={counts.total} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">Filters</span>
            <span className="text-xs text-foreground-muted">
              {sorted.length} of {counts.total} shown
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <FilterRow label="Severity">
            {SEVERITIES.map((s) => (
              <FilterPill
                key={s}
                href={`/operations/alerts${baseQS({ severity: severity === s ? undefined : s })}`}
                active={severity === s}
                tone={s === "error" ? "danger" : s === "warning" ? "warning" : "info"}
              >
                {capitalize(s)}
              </FilterPill>
            ))}
          </FilterRow>
          <FilterRow label="Source">
            {SOURCES.map((s) => (
              <FilterPill
                key={s}
                href={`/operations/alerts${baseQS({ source: source === s ? undefined : s })}`}
                active={source === s}
              >
                {capitalize(s)}
              </FilterPill>
            ))}
          </FilterRow>
          <FilterRow label="Entity">
            {[...ENTITIES, "none"].map((e) => (
              <FilterPill
                key={e}
                href={`/operations/alerts${baseQS({ entity: entity === e ? undefined : e })}`}
                active={entity === e}
              >
                {e === "none" ? "(none)" : capitalize(e.replace("_", " "))}
              </FilterPill>
            ))}
          </FilterRow>
          <FilterRow label="State">
            <FilterPill
              href={`/operations/alerts${baseQS({ state: "open" })}`}
              active={state === "open"}
            >
              Unacknowledged
            </FilterPill>
            <FilterPill
              href={`/operations/alerts${baseQS({ state: "any" })}`}
              active={state === "any"}
            >
              All
            </FilterPill>
            <FilterPill
              href={`/operations/alerts${baseQS({ state: "acked" })}`}
              active={state === "acked"}
            >
              Acknowledged
            </FilterPill>
          </FilterRow>

          <form action="/operations/alerts" method="GET" className="flex items-center gap-2">
            <input type="hidden" name="severity" value={severity ?? ""} />
            <input type="hidden" name="source" value={source ?? ""} />
            <input type="hidden" name="entity" value={entity ?? ""} />
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="sort" value={encodeSort(sortKey, sortDir)} />
            <label htmlFor="q" className="text-xs text-foreground-muted shrink-0 w-16">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="text"
              defaultValue={q}
              placeholder="message or stack trace…"
              className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm placeholder:text-foreground-muted/70 focus:outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-foreground/5 transition-colors cursor-pointer"
            >
              Apply
            </button>
          </form>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2 text-xs text-foreground-muted flex-wrap">
        <span>Sorted by</span>
        <SortPill
          href={`/operations/alerts${baseQS({ sort: encodeSort("time", sortKey === "time" && sortDir === "desc" ? "asc" : "desc") })}`}
          active={sortKey === "time"}
          dir={sortKey === "time" ? sortDir : undefined}
          label="Time"
        />
        <SortPill
          href={`/operations/alerts${baseQS({ sort: encodeSort("severity", sortKey === "severity" && sortDir === "desc" ? "asc" : "desc") })}`}
          active={sortKey === "severity"}
          dir={sortKey === "severity" ? sortDir : undefined}
          label="Severity"
        />
        <span className="text-foreground-muted/70">
          · click any sortable header to flip direction
        </span>
      </div>

      <Card className="!p-0 overflow-hidden">
        {sorted.length === 0 ? (
          <EmptyState
            title="No alerts match"
            description={
              counts.total === 0
                ? "When the backoffice records an error, it'll appear here."
                : "Try widening the filters or clearing the search."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-foreground/[0.02] text-foreground-muted">
                <tr>
                  <SortableTh
                    href={`/operations/alerts${baseQS({ sort: encodeSort("time", sortKey === "time" && sortDir === "desc" ? "asc" : "desc") })}`}
                    active={sortKey === "time"}
                    dir={sortKey === "time" ? sortDir : null}
                  >
                    Time
                  </SortableTh>
                  <SortableTh
                    href={`/operations/alerts${baseQS({ sort: encodeSort("severity", sortKey === "severity" && sortDir === "desc" ? "asc" : "desc") })}`}
                    active={sortKey === "severity"}
                    dir={sortKey === "severity" ? sortDir : null}
                  >
                    Sev
                  </SortableTh>
                  <Th>Source</Th>
                  <Th>Entity</Th>
                  <Th>Action</Th>
                  <Th>Message</Th>
                  <Th>Resource</Th>
                  <Th>Acked</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((alert) => (
                  <AlertRow key={alert.external_id} alert={alert} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function AlertRow({ alert }: { alert: OperatorAlert }) {
  const acked = !!alert.acknowledged_at;
  const tone = sevTone(alert.severity);
  return (
    <tr
      className={`border-t border-border transition-colors hover:bg-foreground/[0.025] ${
        acked ? "opacity-70" : ""
      }`}
    >
      <Td className="text-foreground-muted whitespace-nowrap font-mono text-xs">
        {formatTime(alert.created_at)}
      </Td>
      <Td>
        <Badge tone={tone}>{alert.severity}</Badge>
      </Td>
      <Td className="text-xs">{capitalize(alert.source)}</Td>
      <Td className="text-xs text-foreground-muted">
        {alert.resource_type ? alert.resource_type.replace("_", " ") : "—"}
      </Td>
      <Td className="font-mono text-xs">{alert.action ?? "—"}</Td>
      <Td className="max-w-[28rem]">
        <div className="truncate" title={alert.message}>
          {alert.message}
        </div>
      </Td>
      <Td className="text-xs">
        {alert.resource_external_id ? (
          <ResourceLink
            type={alert.resource_type}
            externalId={alert.resource_external_id}
          />
        ) : (
          <span className="text-foreground-muted">—</span>
        )}
      </Td>
      <Td>
        {acked ? (
          <span
            className="text-xs text-success"
            title={`${alert.acknowledged_at} by ${alert.acknowledged_by ?? "operator"}`}
          >
            yes
          </span>
        ) : (
          <span className="text-xs text-foreground-muted">—</span>
        )}
      </Td>
      <Td>
        <AckButton externalId={alert.external_id} acknowledged={acked} />
      </Td>
    </tr>
  );
}

function ResourceLink({
  type,
  externalId,
}: {
  type: OperatorAlert["resource_type"];
  externalId: string;
}) {
  const short = externalId.slice(0, 8);
  if (type === "market")
    return (
      <Link
        href={`/markets/${encodeURIComponent(externalId)}?from=alerts`}
        className="text-accent hover:underline font-mono"
      >
        {short}
      </Link>
    );
  if (type === "deploy_plan")
    return (
      <Link
        href={`/deploy-plans/${encodeURIComponent(externalId)}?from=alerts`}
        className="text-accent hover:underline font-mono"
      >
        {short}
      </Link>
    );
  if (type === "operator_log")
    return (
      <Link
        href={`/operator-log?correlation_id=${encodeURIComponent(externalId)}&from=alerts`}
        className="text-accent hover:underline font-mono"
      >
        {short}
      </Link>
    );
  return <span className="font-mono text-xs">{short}</span>;
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <span className="text-xs text-foreground-muted shrink-0 w-16 pt-1.5">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  tone,
  children,
}: {
  href: string;
  active: boolean;
  tone?: "danger" | "warning" | "info" | "neutral";
  children: React.ReactNode;
}) {
  const t = tone ?? "neutral";
  const activeStyles =
    t === "danger"
      ? "border-danger/40 bg-danger/10 text-danger"
      : t === "warning"
        ? "border-warning/40 bg-warning/10 text-warning"
        : t === "info"
          ? "border-info/40 bg-info/10 text-info"
          : "border-foreground bg-foreground text-background";
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-2.5 h-7 rounded-full text-xs border transition-colors cursor-pointer ${
        active
          ? activeStyles
          : "border-border text-foreground-muted hover:text-foreground hover:bg-foreground/[0.04]"
      }`}
    >
      {children}
    </Link>
  );
}

function SortPill({
  href,
  active,
  dir,
  label,
}: {
  href: string;
  active: boolean;
  dir?: SortDir;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-xs border transition-colors cursor-pointer ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-foreground-muted hover:text-foreground hover:bg-foreground/[0.04]"
      }`}
    >
      {label}
      {dir ? (dir === "desc" ? <DownIcon /> : <UpIcon />) : null}
    </Link>
  );
}

function SortableTh({
  href,
  active,
  dir,
  children,
}: {
  href: string;
  active: boolean;
  dir: SortDir | null;
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className="text-left font-medium text-[11px] uppercase tracking-wider px-4 py-2.5 whitespace-nowrap"
    >
      <Link
        href={href}
        className={`inline-flex items-center gap-1 transition-colors cursor-pointer ${
          active ? "text-foreground" : "hover:text-foreground"
        }`}
        aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
      >
        {children}
        {dir === "desc" ? <DownIcon /> : dir === "asc" ? <UpIcon /> : null}
      </Link>
    </th>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="text-left font-medium text-[11px] uppercase tracking-wider px-4 py-2.5 whitespace-nowrap"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}

function DownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 10l5 5 5-5" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 14l5-5 5 5" />
    </svg>
  );
}

// ----- helpers -----

function pickEnum<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

function readSort(raw: string | string[] | undefined): [SortKey, SortDir] {
  if (typeof raw !== "string") return ["time", "desc"];
  const [k, d] = raw.split(":");
  const key: SortKey = k === "severity" ? "severity" : "time";
  const dir: SortDir = d === "asc" ? "asc" : "desc";
  return [key, dir];
}

function encodeSort(k: SortKey, d: SortDir): string {
  return `${k}:${d}`;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function sortAlerts(rows: OperatorAlert[], key: SortKey, dir: SortDir): OperatorAlert[] {
  const factor = dir === "asc" ? 1 : -1;
  if (key === "severity") {
    return [...rows].sort((a, b) => {
      const cmp = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (cmp !== 0) return -cmp * factor;
      // Tie-break by recency (newest first regardless of dir).
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }
  return [...rows].sort(
    (a, b) =>
      (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * factor,
  );
}

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function sevTone(s: AlertSeverity): "danger" | "warning" | "info" {
  if (s === "error") return "danger";
  if (s === "warning") return "warning";
  return "info";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
