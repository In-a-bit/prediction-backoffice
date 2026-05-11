import Link from "next/link";

import { TaskToggle } from "./task-toggle";
import { Badge, Card, CardBody, CardHeader, Stat } from "./ui";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import type { Task } from "@/lib/types";

// Per-task health card used on the dashboard. Renders activity counts, the
// next slot end, and inline create/resolve toggles.
export function TaskCard({ task }: { task: Task }) {
  const intervalLabel = task.interval?.label ?? `interval ${task.interval_id}`;
  const assetLabel = task.asset
    ? `${task.asset.display_name}/${task.asset.target.toUpperCase()}`
    : `asset ${task.asset_id}`;
  const stats = task.stats;

  const failed24 = stats?.failed_last_24h ?? 0;
  const pending = stats?.pending_now ?? 0;
  const awaitingVerify = stats?.awaiting_verify_now ?? 0;
  const created24 = stats?.created_last_24h ?? 0;
  const totalCreated = stats?.total_created ?? 0;
  const totalVerified = stats?.total_verified ?? 0;
  const overdueResolution = stats?.awaiting_resolution ?? 0;
  const awaitingPrice = stats?.awaiting_price_count ?? 0;

  const healthBadge = (() => {
    if (!task.is_create_active && !task.is_resolve_active) {
      return <Badge tone="neutral">Paused</Badge>;
    }
    if (failed24 > 0) return <Badge tone="danger">{failed24} failed (24h)</Badge>;
    if (overdueResolution > 0)
      return <Badge tone="warning">{overdueResolution} awaiting resolve</Badge>;
    if (awaitingPrice > 0)
      return <Badge tone="warning">{awaitingPrice} awaiting price</Badge>;
    if (awaitingVerify > 0)
      return <Badge tone="info">{awaitingVerify} verifying</Badge>;
    if (pending > 0) return <Badge tone="info">{pending} pending</Badge>;
    return <Badge tone="success">Healthy</Badge>;
  })();

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={`/tasks/${task.id}`}
              className="text-base font-semibold hover:text-accent inline-flex items-baseline gap-2"
            >
              {assetLabel}
              <span className="text-foreground-muted text-sm font-normal">
                · {intervalLabel}
              </span>
            </Link>
            <div className="text-xs text-foreground-muted mt-0.5 truncate">
              {task.series_slug}
            </div>
          </div>
          {healthBadge}
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Stat label="Created (24h)" value={created24} tone="success" />
          <Stat
            label="Verifying"
            value={awaitingVerify}
            tone={awaitingVerify > 0 ? "info" : "neutral"}
            hint="awaiting on-chain confirmation"
          />
          <Stat
            label="Failed (24h)"
            value={failed24}
            tone={failed24 > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="Awaiting price"
            value={awaitingPrice}
            tone={awaitingPrice > 0 ? "warning" : "neutral"}
          />
          <Stat
            label="Awaiting resolve"
            value={overdueResolution}
            tone={overdueResolution > 0 ? "warning" : "neutral"}
          />
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Row
            label="Time ahead"
            value={formatDuration(task.time_ahead_minutes)}
          />
          <Row
            label="Verified / created"
            value={`${totalVerified.toLocaleString()} / ${totalCreated.toLocaleString()}`}
          />
          <Row
            label="Next slot ends"
            value={
              stats?.next_slot_end
                ? `${formatDateTime(stats.next_slot_end)} (${formatRelative(stats.next_slot_end)})`
                : "—"
            }
          />
          <Row
            label="Last priceToBeat"
            value={
              stats?.last_price_to_beat_at
                ? formatRelative(stats.last_price_to_beat_at)
                : "—"
            }
          />
        </dl>
      </CardBody>

      <div className="border-t border-border bg-surface-muted px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <TaskToggle
          taskId={task.id}
          field="is_create_active"
          value={task.is_create_active}
          label="Create"
        />
        <TaskToggle
          taskId={task.id}
          field="is_resolve_active"
          value={task.is_resolve_active}
          label="Resolve"
        />
        <div className="flex-1" />
        <Link
          href={`/tasks/${task.id}`}
          className="text-sm text-accent hover:underline"
        >
          View activity →
        </Link>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
