import Link from "next/link";

import { MarketsBrowser } from "./markets-browser";
import {
  Card,
  EmptyState,
  ErrorMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { listTaskMarkets, listTasks } from "@/lib/api";
import type { CreatedMarket, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

// A market row enriched with the task it belongs to so the browser can render
// asset / interval / behavior info on each row.
export type EnrichedMarket = CreatedMarket & {
  task_id: number;
  task_asset_label: string;
  task_interval_label: string;
  behavior_key: "crypto-interval";
};

export default async function MarketsPage() {
  let tasks: Task[] = [];
  let markets: EnrichedMarket[] = [];
  let error: string | null = null;

  try {
    tasks = await listTasks();
    // Fan-out market fetches per task. ~50 most recent per task gives a useful
    // working set without overwhelming the API; can be lifted to a dedicated
    // endpoint later.
    const fetched = await Promise.all(
      tasks.map(async (t) => {
        try {
          const ms = await listTaskMarkets(t.id, 50);
          const assetLabel = t.asset
            ? `${t.asset.display_name}/${t.asset.target.toUpperCase()}`
            : `asset ${t.asset_id}`;
          const intervalLabel = t.interval?.label ?? `interval ${t.interval_id}`;
          return ms.map<EnrichedMarket>((m) => ({
            ...m,
            task_id: t.id,
            task_asset_label: assetLabel,
            task_interval_label: intervalLabel,
            behavior_key: "crypto-interval" as const,
          }));
        } catch {
          return [] as EnrichedMarket[];
        }
      }),
    );
    markets = fetched.flat().sort((a, b) => {
      const bt = new Date(b.slot_end).getTime();
      const at = new Date(a.slot_end).getTime();
      return bt - at;
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Markets"
        description="Filter and inspect every market the backoffice has created. Pulled from the active crypto-interval tasks today; manual and sports markets will appear here once those behaviors ship."
      />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      {tasks.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No markets yet"
            description="Create a crypto-interval task and the backoffice will start producing markets here."
            action={
              <Link
                href="/automations/crypto-interval/new"
                className={buttonVariants.primary}
              >
                New crypto task
              </Link>
            }
          />
        </Card>
      ) : (
        <MarketsBrowser markets={markets} tasks={tasks} />
      )}
    </div>
  );
}
