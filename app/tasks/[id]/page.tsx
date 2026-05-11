import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { TaskToggle } from "@/components/task-toggle";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorMessage,
  PageHeader,
  Stat,
} from "@/components/ui";
import { BackofficeApiError, getTask, listTaskMarkets } from "@/lib/api";
import {
  formatDateTime,
  formatDateTimeFull,
  formatDuration,
  formatPrice,
  formatRelative,
  shortId,
} from "@/lib/format";
import type { CreatedMarket, CreatedMarketStatus, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId)) notFound();

  let task: Task | null = null;
  let markets: CreatedMarket[] = [];
  let error: string | null = null;

  try {
    [task, markets] = await Promise.all([
      getTask(numericId),
      listTaskMarkets(numericId, 100),
    ]);
  } catch (e) {
    if (e instanceof BackofficeApiError && e.status === 404) {
      notFound();
    }
    error = e instanceof Error ? e.message : String(e);
  }

  if (!task) {
    return (
      <div className="space-y-6">
        <PageHeader title="Task" />
        <ErrorMessage>{error ?? "Task not found"}</ErrorMessage>
      </div>
    );
  }

  const stats = task.stats;
  const assetLabel = task.asset
    ? `${task.asset.display_name}/${task.asset.target.toUpperCase()}`
    : `Asset ${task.asset_id}`;
  const intervalLabel = task.interval?.label ?? `interval ${task.interval_id}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-foreground-muted">
        <Link href="/tasks" className="hover:text-foreground">
          ← All tasks
        </Link>
      </div>

      <PageHeader
        title={`${assetLabel} · ${intervalLabel}`}
        description={task.series_slug}
        actions={<AutoRefresh />}
      />

      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-6">
            <Stat
              label="Created (24h)"
              value={stats?.created_last_24h ?? 0}
              tone="success"
            />
            <Stat
              label="Verifying"
              value={stats?.awaiting_verify_now ?? 0}
              tone={(stats?.awaiting_verify_now ?? 0) > 0 ? "info" : "neutral"}
              hint="awaiting deploy confirmation"
            />
            <Stat
              label="Failed (24h)"
              value={stats?.failed_last_24h ?? 0}
              tone={(stats?.failed_last_24h ?? 0) > 0 ? "danger" : "neutral"}
            />
            <Stat
              label="Pending now"
              value={stats?.pending_now ?? 0}
              tone={(stats?.pending_now ?? 0) > 0 ? "warning" : "neutral"}
            />
            <Stat
              label="Awaiting price"
              value={stats?.awaiting_price_count ?? 0}
              tone={
                (stats?.awaiting_price_count ?? 0) > 0 ? "warning" : "neutral"
              }
            />
            <Stat
              label="Awaiting resolve"
              value={stats?.awaiting_resolution ?? 0}
              tone={
                (stats?.awaiting_resolution ?? 0) > 0 ? "warning" : "neutral"
              }
            />
            <Stat
              label="Verified / created"
              value={`${(stats?.total_verified ?? 0).toLocaleString()} / ${(stats?.total_created ?? 0).toLocaleString()}`}
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold">Configuration</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Row label="Time ahead" value={formatDuration(task.time_ahead_minutes)} />
            <Row label="First market at" value={formatDateTimeFull(task.first_market_at)} />
            <Row
              label="Next slot ends"
              value={
                stats?.next_slot_end
                  ? `${formatDateTimeFull(stats.next_slot_end)} (${formatRelative(stats.next_slot_end)})`
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
            <Row
              label="Last created"
              value={
                stats?.last_created_at
                  ? formatRelative(stats.last_created_at)
                  : "—"
              }
            />
            <Row
              label="Last verified"
              value={
                stats?.last_verified_at
                  ? formatRelative(stats.last_verified_at)
                  : "—"
              }
            />
            <Row label="Series id" value={`#${task.series_id}`} />
            <Row label="Tags" value={`${task.tag_ids.length} attached`} />
            <div className="pt-2 border-t border-border space-y-2">
              <TaskToggle
                taskId={task.id}
                field="is_create_active"
                value={task.is_create_active}
                label="Create active"
              />
              <TaskToggle
                taskId={task.id}
                field="is_resolve_active"
                value={task.is_resolve_active}
                label="Resolve active"
              />
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent markets</h2>
            <span className="text-xs text-foreground-muted">
              Showing {markets.length} most recent
            </span>
          </CardHeader>
          <CardBody className="p-0">
            {markets.length === 0 ? (
              <EmptyState
                title="No markets yet"
                description="Markets will appear here as the create loop runs."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-foreground-muted border-b border-border">
                      <th className="px-5 py-2.5 font-medium">Slot end</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">priceToBeat</th>
                      <th className="px-3 py-2.5 font-medium">Slug</th>
                      <th className="px-5 py-2.5 font-medium">Market</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markets.map((m) => (
                      <MarketRow key={m.id} market={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-foreground-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function MarketRow({ market }: { market: CreatedMarket }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-foreground/[0.02]">
      <td className="px-5 py-2.5 whitespace-nowrap">
        <div className="font-medium">{formatDateTime(market.slot_end)}</div>
        <div className="text-xs text-foreground-muted">
          {formatRelative(market.slot_end)}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <MarketStatusBadge market={market} />
        {market.error ? (
          <div
            className="text-xs text-danger truncate max-w-[14rem] mt-0.5"
            title={market.error}
          >
            {market.error}
          </div>
        ) : null}
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

// MarketStatusBadge renders the full lifecycle: PENDING → VERIFYING (CREATED
// without verified_at) → VERIFIED (CREATED with verified_at) → FAILED. The
// verified_at timestamp is stamped by the backoffice's verifier loop once
// dpm-api confirms the on-chain deployment reached REGISTERED/DEPLOYED, so
// "VERIFIED" in the UI means the market is actually live on-chain.
function MarketStatusBadge({ market }: { market: CreatedMarket }) {
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
