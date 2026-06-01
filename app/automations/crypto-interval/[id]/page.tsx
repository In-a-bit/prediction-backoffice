import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { MarketsPanel } from "@/components/crypto-interval/markets-panel";
import { Pagination } from "@/components/pagination";
import { TaskToggle } from "@/components/task-toggle";
import {
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  PageHeader,
  Stat,
} from "@/components/ui";
import { BackofficeApiError, type Paginated, crypto } from "@/lib/api";
import { behaviors } from "@/lib/behaviors";
import {
  formatDateTimeFull,
  formatDuration,
  formatRelative,
} from "@/lib/format";
import type { CreatedMarket, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

const behavior = behaviors["crypto-interval"];

type Params = { id: string };
type SearchParams = { page?: string; per_page?: string };

const DEFAULT_PER_PAGE = 25;

export default async function CryptoIntervalTaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const numericId = Number.parseInt(id, 10);
  if (!Number.isFinite(numericId)) notFound();

  const perPage = clampPerPage(Number(sp.per_page) || DEFAULT_PER_PAGE);
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * perPage;

  let task: Task | null = null;
  let marketsPage: Paginated<CreatedMarket> = { data: [], total: 0, limit: perPage, offset };
  let error: string | null = null;

  try {
    [task, marketsPage] = await Promise.all([
      crypto.getTask(numericId),
      crypto.listTaskMarkets(numericId, { limit: perPage, offset }),
    ]);
  } catch (e) {
    if (e instanceof BackofficeApiError && e.status === 404) {
      notFound();
    }
    error = e instanceof Error ? e.message : String(e);
  }

  const marketsBasePath = `/automations/crypto-interval/${id}`;

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
        <Link href={behavior.href} className="hover:text-foreground">
          ← All crypto tasks
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
            <h2 className="text-sm font-semibold">Markets</h2>
            <span className="text-xs text-foreground-muted">
              {marketsPage.total.toLocaleString()} total
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <Pagination
              total={marketsPage.total}
              page={page}
              perPage={perPage}
              basePath={marketsBasePath}
            />
            <MarketsPanel markets={marketsPage.data} taskStats={task.stats} />
            <Pagination
              total={marketsPage.total}
              page={page}
              perPage={perPage}
              basePath={marketsBasePath}
            />
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

function clampPerPage(n: number): number {
  if ([10, 25, 50, 100].includes(n)) return n;
  return DEFAULT_PER_PAGE;
}
