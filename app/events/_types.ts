// Row + payload shapes shared between page.tsx (loaders) and the per-source
// tab components. Lives outside page.tsx so Next.js's "page can only export
// the default route component" rule is satisfied.

import type { Asset, Interval, SportTask, Task } from "@/lib/types";

export type ManualEventRow = {
  external_id: string;
  title: string;
  series: string | null;
  series_id: number | null;
  created_at: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  paused: boolean;
  market_count: number;
  deployment_status: string;
};

export type CryptoEventRow = {
  event_external_id: string;
  asset: string;
  interval: string;
  slot_start: string;
  slot_end: string;
  price_to_beat: string | null;
  price_at_close: string | null;
  outcome: "up" | "down" | null;
  market_count: number;
  is_skipped: boolean;
};

export type SportEventRow = {
  event_external_id: string;
  sport: string;
  country: string;
  league: string;
  match: string;
  kickoff_at: string;
  fixture_status_short: string;
  market_count: number;
};

export type ManualPayload = {
  rows: ManualEventRow[];
  knownSeries: { id: number; slug: string }[];
  error: string | null;
};

export type CryptoPayload = {
  rows: CryptoEventRow[];
  assets: Asset[];
  intervals: Interval[];
  tasks: Task[];
  error: string | null;
};

export type SportPayload = {
  rows: SportEventRow[];
  tasks: SportTask[];
  error: string | null;
};
