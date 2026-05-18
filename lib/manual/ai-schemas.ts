// Zod schemas for the AI draft route — ported from the CRM
// (prediction-onchain-actions/app/api/admin/adapt-polymarket/route.ts) and
// extended with the two composite shapes the from-description flow uses.

import { z } from "zod";

export const SeriesSchema = z.object({
  slug: z.string(),
  title: z.string(),
  ticker: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  series_type: z.string().optional(),
  recurrence: z.string().optional(),
  active: z.boolean().default(true),
  closed: z.boolean().default(false),
  archived: z.boolean().default(false),
  restricted: z.boolean().default(false),
  featured: z.boolean().default(false),
  new: z.boolean().default(false),
  requires_translation: z.boolean().default(false),
  comment_count: z.number().int().optional(),
  metadata_type: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type SeriesDraft = z.infer<typeof SeriesSchema>;

export const EventSchema = z.object({
  slug: z.string(),
  title: z.string(),
  ticker: z.string().optional(),
  description: z.string().optional(),
  resolution_source: z.string().optional(),
  start_date: z.string().optional().describe("ISO 8601 datetime"),
  end_date: z.string().optional().describe("ISO 8601 datetime"),
  icon: z.string().optional(),
  active: z.boolean().default(true),
  closed: z.boolean().default(false),
  archived: z.boolean().default(false),
  restricted: z.boolean().default(false),
  neg_risk: z.boolean().default(false),
  neg_risk_market_id: z.string().optional(),
  comment_count: z.number().int().optional(),
  metadata_type: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type EventDraft = z.infer<typeof EventSchema>;

export const MarketSchema = z.object({
  question: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  resolution_source: z.string().optional(),
  start_date: z.string().optional().describe("ISO 8601 datetime"),
  end_date: z.string().optional().describe("ISO 8601 datetime"),
  active: z.boolean().default(true),
  closed: z.boolean().default(false),
  archived: z.boolean().default(false),
  restricted: z.boolean().default(false),
  neg_risk: z.boolean().default(false),
  neg_risk_market_id: z.string().optional(),
  neg_risk_request_id: z.string().optional(),
  neg_risk_other: z.boolean().default(false),
  accepting_orders: z.boolean().default(true),
  accepting_orders_timestamp: z.string().optional(),
  funded: z.boolean().default(false),
  approved: z.boolean().default(false),
  activation: z.enum(["AUTO", "MANUAL"]).default("AUTO"),
  automatically_active: z.boolean().default(false),
  clear_book_on_start: z.boolean().default(false),
  rfq_enabled: z.boolean().default(false),
  // Decimals as numbers in the AI output; the create form coerces to string
  // before submitting to dpm-api (which expects decimal strings).
  order_price_min_tick_size: z.number().optional(),
  order_min_size: z.number().int().optional(),
  uma_bond: z.string().optional().describe("integer string in wei"),
  uma_reward: z.string().optional().describe("integer string in wei"),
  liveness: z.string().optional(),
  metadata_type: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type MarketDraft = z.infer<typeof MarketSchema>;

export const TagSchema = z.object({
  slug: z.string().describe("URL-safe slug"),
  label: z.string().describe("Human-readable display label"),
});
export type TagDraft = z.infer<typeof TagSchema>;

// A single-event description draft: one event with N markets.
export const SingleEventDraftSchema = z.object({
  event: EventSchema,
  markets: z.array(MarketSchema).min(1),
  tags: z.array(TagSchema).default([]),
});
export type SingleEventDraft = z.infer<typeof SingleEventDraftSchema>;

// A series-of-events description draft: one series, multiple events,
// each with its own markets.
export const SeriesOfEventsDraftSchema = z.object({
  series: SeriesSchema,
  events: z
    .array(
      z.object({
        event: EventSchema,
        markets: z.array(MarketSchema).min(1),
      }),
    )
    .min(1),
  tags: z.array(TagSchema).default([]),
});
export type SeriesOfEventsDraft = z.infer<typeof SeriesOfEventsDraftSchema>;

export type AiDraftMode = "single-event" | "series-of-events";

export type AiDraftRequest =
  | { mode: "single-event"; description: string }
  | { mode: "series-of-events"; description: string };

export type AiDraftResponse =
  | { mode: "single-event"; data: SingleEventDraft }
  | { mode: "series-of-events"; data: SeriesOfEventsDraft };
