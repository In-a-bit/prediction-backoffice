import Link from "next/link";

import { EventsBrowser } from "./events-browser";
import {
  Card,
  EmptyState,
  ErrorMessage,
  InfoMessage,
  PageHeader,
  buttonVariants,
} from "@/components/ui";
import { listTaskMarkets, listTasks } from "@/lib/api";
import type { CreatedMarket, Task } from "@/lib/types";

export const dynamic = "force-dynamic";

// One derived "event" — a grouping of created markets that share the same
// upstream event_external_id, plus a synthetic row per market that has no
// event id yet (which is the common case for crypto up/down right now).
export type DerivedEvent = {
  key: string;
  event_external_id: string | null;
  market_count: number;
  first_slot_end: string;
  last_slot_end: string;
  task_ids: number[];
  task_asset_label: string;
  task_interval_label: string;
  statuses: { verified: number; verifying: number; pending: number; failed: number };
};

export default async function EventsPage() {
  let tasks: Task[] = [];
  let events: DerivedEvent[] = [];
  let error: string | null = null;

  try {
    tasks = await listTasks();
    const all: { task: Task; markets: CreatedMarket[] }[] = await Promise.all(
      tasks.map(async (t) => {
        try {
          return { task: t, markets: await listTaskMarkets(t.id, 50) };
        } catch {
          return { task: t, markets: [] as CreatedMarket[] };
        }
      }),
    );

    const map = new Map<string, DerivedEvent>();
    for (const { task, markets } of all) {
      const assetLabel = task.asset
        ? `${task.asset.display_name}/${task.asset.target.toUpperCase()}`
        : `asset ${task.asset_id}`;
      const intervalLabel = task.interval?.label ?? `interval ${task.interval_id}`;
      for (const m of markets) {
        // Markets without an event id each become a "synthetic" event keyed
        // by market id, since at the platform level each market currently
        // doubles as its own event.
        const key = m.event_external_id ?? `market:${task.id}:${m.id}`;
        const existing = map.get(key);
        const slot = m.slot_end;
        const statusBucket = (() => {
          if (m.status === "FAILED") return "failed";
          if (m.status === "PENDING") return "pending";
          if (m.status === "CREATED")
            return m.verified_at ? "verified" : "verifying";
          return "pending";
        })();

        if (!existing) {
          map.set(key, {
            key,
            event_external_id: m.event_external_id ?? null,
            market_count: 1,
            first_slot_end: slot,
            last_slot_end: slot,
            task_ids: [task.id],
            task_asset_label: assetLabel,
            task_interval_label: intervalLabel,
            statuses: {
              verified: statusBucket === "verified" ? 1 : 0,
              verifying: statusBucket === "verifying" ? 1 : 0,
              pending: statusBucket === "pending" ? 1 : 0,
              failed: statusBucket === "failed" ? 1 : 0,
            },
          });
        } else {
          existing.market_count++;
          if (!existing.task_ids.includes(task.id))
            existing.task_ids.push(task.id);
          if (new Date(slot) < new Date(existing.first_slot_end))
            existing.first_slot_end = slot;
          if (new Date(slot) > new Date(existing.last_slot_end))
            existing.last_slot_end = slot;
          existing.statuses[statusBucket]++;
        }
      }
    }

    events = Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.last_slot_end).getTime() -
        new Date(a.last_slot_end).getTime(),
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Derived from the markets the backoffice has produced. Each row groups every market that shares an upstream event id — useful for finding the up/down pair for a given slot, or the full set of markets for a sports fixture once that ships."
      />

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <InfoMessage>
        Events are currently derived client-side from market data. A dedicated
        events endpoint will replace this view as soon as it lands.
      </InfoMessage>

      {events.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No events yet"
            description="Once the backoffice creates markets, the derived events will appear here."
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
        <EventsBrowser events={events} tasks={tasks} />
      )}
    </div>
  );
}
