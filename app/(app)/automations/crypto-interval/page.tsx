import Link from "next/link";

import { Pagination } from "@/components/pagination";
import { TaskToggle } from "@/components/task-toggle";
import {
  Badge,
  Card,
  EmptyState,
  ErrorMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { type Paginated, crypto } from "@/lib/api";
import { behaviors } from "@/lib/behaviors";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

const behavior = behaviors["crypto-interval"];
const DEFAULT_PER_PAGE = 25;

type SearchParams = { page?: string; per_page?: string };

function clampPerPage(n: number): number {
  return [10, 25, 50, 100].includes(n) ? n : DEFAULT_PER_PAGE;
}

export default async function CryptoIntervalListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const perPage = clampPerPage(Number(sp.per_page) || DEFAULT_PER_PAGE);
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * perPage;

  let result: Paginated<Task> = { data: [], total: 0, limit: perPage, offset };
  let error: string | null = null;
  try {
    result = await crypto.listTasks({ withStats: true, limit: perPage, offset });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const tasks = result.data;

  const basePath = "/automations/crypto-interval";

  return (
    <div className="space-y-6">
      <PageHeader
        title={behavior.name}
        description={behavior.tagline + " — each task drives auto-creation and auto-resolution for one asset / interval pair."}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/automations/crypto-interval/assets"
              className={buttonVariants.secondary}
            >
              Manage assets
            </Link>
            <Link href={behavior.newHref} className={buttonVariants.primary}>
              New crypto task
            </Link>
          </div>
        }
      />

      {error ? <ErrorMessage>Backoffice API unreachable: {error}</ErrorMessage> : null}

      {tasks.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No crypto-interval tasks yet"
            description="Tasks define which markets get auto-created and resolved for crypto assets."
            action={
              <Link href={behavior.newHref} className={buttonVariants.primary}>
                Create your first task
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <Pagination
            total={result.total}
            page={page}
            perPage={perPage}
            basePath={basePath}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-foreground-muted">
                  <th className="px-5 py-3 font-medium">Task</th>
                  <th className="px-3 py-3 font-medium">Interval</th>
                  <th className="px-3 py-3 font-medium">Time ahead</th>
                  <th className="px-3 py-3 font-medium">Created (24h)</th>
                  <th className="px-3 py-3 font-medium">Verifying</th>
                  <th className="px-3 py-3 font-medium">Failed (24h)</th>
                  <th className="px-3 py-3 font-medium">Next slot</th>
                  <th className="px-3 py-3 font-medium">Toggles</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            total={result.total}
            page={page}
            perPage={perPage}
            basePath={basePath}
          />
        </Card>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const stats = task.stats;
  const failed = stats?.failed_last_24h ?? 0;
  const created = stats?.created_last_24h ?? 0;
  const verifying = stats?.awaiting_verify_now ?? 0;
  const assetLabel = task.asset
    ? `${task.asset.display_name}/${task.asset.target.toUpperCase()}`
    : `asset ${task.asset_id}`;

  return (
    <tr className="border-t border-border hover:bg-foreground/[0.02]">
      <td className="px-5 py-3">
        <Link
          href={`/automations/crypto-interval/${task.id}`}
          className="font-medium hover:text-accent"
        >
          {assetLabel}
        </Link>
        <div className="text-xs text-foreground-muted truncate max-w-[18rem]">
          {task.series_slug}
        </div>
      </td>
      <td className="px-3 py-3">
        <Badge tone="neutral">{task.interval?.label ?? "—"}</Badge>
      </td>
      <td className="px-3 py-3 tabular-nums">
        {formatDuration(task.time_ahead_minutes)}
      </td>
      <td className="px-3 py-3 tabular-nums">{created.toLocaleString()}</td>
      <td className="px-3 py-3 tabular-nums">
        {verifying > 0 ? (
          <span className="text-info font-medium">{verifying}</span>
        ) : (
          0
        )}
      </td>
      <td className="px-3 py-3 tabular-nums">
        {failed > 0 ? (
          <span className="text-danger font-medium">{failed}</span>
        ) : (
          0
        )}
      </td>
      <td className="px-3 py-3 text-foreground-muted">
        {stats?.next_slot_end ? formatDateTime(stats.next_slot_end) : "—"}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5">
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
        </div>
      </td>
      <td className="px-5 py-3 text-right">
        <Link
          href={`/automations/crypto-interval/${task.id}`}
          className="text-sm text-accent hover:underline"
        >
          Open →
        </Link>
      </td>
    </tr>
  );
}
