// Re-exports of the shared market-row shape so the client table can import
// from a co-located path without leaking server-only details.

export type { MarketRow, AcceptingFlag } from "@/lib/market-rows";

import type { MarketRow } from "@/lib/market-rows";

export type MarketsPayload = {
  rows: MarketRow[];
  series: string[];
  umaStatuses: string[];
  error: string | null;
};
