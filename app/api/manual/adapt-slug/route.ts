import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

import {
  EventSchema,
  MarketSchema,
  SeriesSchema,
  TagSchema,
} from "@/lib/manual/ai-schemas";

const GAMMA_API = "https://gamma-api.polymarket.com";

const AdaptResultSchema = z.object({
  series: SeriesSchema.nullable().describe(
    "Set to null when the Polymarket event has no parent series",
  ),
  event: EventSchema,
  markets: z.array(MarketSchema).min(1),
  tags: z.array(TagSchema).default([]),
});

export type AdaptSlugResult = z.infer<typeof AdaptResultSchema>;

export async function POST(req: NextRequest) {
  let slug: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { slug?: string };
    slug = (body.slug ?? "").trim();
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) is not configured on the server",
        },
        { status: 500 },
      );
    }
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
    }

    const gammaUrl = `${GAMMA_API}/events/slug/${encodeURIComponent(slug)}`;
    const gammaRes = await fetch(gammaUrl, { cache: "no-store" });
    if (!gammaRes.ok) {
      const text = await gammaRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Polymarket gamma returned ${gammaRes.status}: ${
            text || gammaRes.statusText
          }`,
        },
        { status: 502 },
      );
    }
    const polymarket = await gammaRes.json();

    // Truncate aggressively — large gamma payloads have nested order books that
    // we don't need. Keep enough head for the title/description/markets array.
    const promptInput = JSON.stringify(polymarket).slice(0, 180_000);

    const { output } = await generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema: AdaptResultSchema }),
      system: [
        "You convert a Polymarket gamma API event payload into our internal Series/Event/Market payload shape.",
        "Polymarket is the source of truth — preserve its data faithfully — but the operator wants a draft",
        "they can ship with minimal cleanup, so fill in any gaps thoughtfully rather than leaving fields blank.",
        "",
        "OUTPUT FORMAT",
        "- Match the schema EXACTLY. Never include external IDs from Polymarket — our system generates them.",
        "- Convert all datetime fields to ISO 8601 with timezone.",
        "- event.deployment_status defaults to 'PENDING'.",
        "- Skip markets with closed=true UNLESS the entire event has only closed markets, in which case include them all.",
        "",
        "TITLES, SLUGS, DATES, FLAGS",
        "- Preserve slugs, titles, dates, and flags verbatim from the Polymarket payload.",
        "- event.neg_risk mirrors Polymarket negRisk.",
        "- For each market copy: question, slug, description, resolution_source (from resolutionSource),",
        "  start_date/end_date, neg_risk, accepting_orders, funded, approved, rfq_enabled,",
        "  order_price_min_tick_size (orderPriceMinTickSize), order_min_size (orderMinSize),",
        "  uma_bond (umaBond), uma_reward (umaReward), uma_resolution_status (umaResolutionStatus).",
        "",
        "DESCRIPTIONS — fill in gaps",
        "- Use Polymarket's event description verbatim when it is at least 2 sentences. When it is missing or",
        "  one short line, expand it to 2-4 sentences covering: the underlying real-world question, the",
        "  resolution criteria, and the source of truth used for resolution. Stay strictly faithful to the",
        "  Polymarket facts — don't invent dates, thresholds, or numbers that aren't already in the payload.",
        "- Same rule for each market.description: use Polymarket's verbatim when sufficient, otherwise expand",
        "  to 2-3 sentences explaining the specific market's question, threshold, and how it resolves.",
        "  Markets within the same event should differ in their descriptions when their conditions differ.",
        "",
        "ICONS / IMAGES — never leave blank when source has them",
        "- event.icon: prefer the Polymarket icon/image URL verbatim. If absent, suggest a free-to-use URL:",
        "    1. Wikimedia Commons direct file: https://upload.wikimedia.org/wikipedia/commons/...",
        "    2. Simple Icons CDN for known brands/logos: https://cdn.simpleicons.org/<slug>",
        "       (e.g. /bitcoin, /ethereum, /apple, /nba, /tesla)",
        "  Only suggest a URL if you can pick a stable, real path; otherwise leave empty.",
        "- For each market, copy the Polymarket per-market icon/image into metadata.image_url (the market",
        "  schema has no top-level icon). When Polymarket only has a single event-level image, reuse it.",
        "  When markets each represent a team/candidate, prefer per-team images if Polymarket provides them.",
        "",
        "TAGS",
        "- Tags: emit {slug, label} verbatim from the Polymarket tags[] array. Drop duplicates by slug.",
        "- Do NOT invent tags that are not in the payload.",
        "",
        "METADATA",
        "- event.metadata_type: short classifier inferred from tags (e.g. 'politics', 'sports', 'crypto').",
        "- event.metadata: the Polymarket eventMetadata object verbatim if present, otherwise an empty object.",
        "- market.metadata_type matches event.metadata_type.",
        "- market.metadata MUST include image_url (per the rule above) and MAY include",
        "  {polymarket_group_item_title, polymarket_group_item_threshold} when groupItemTitle/Threshold exist.",
        "",
        "SERIES",
        "- Series: only emit when the payload has a real series/parent grouping. Otherwise return null.",
        "- When emitted, copy the series icon and write a 1-2 sentence description framing the recurring theme.",
      ].join("\n"),
      prompt: `Polymarket gamma event payload (JSON):\n${promptInput}`,
    });

    return NextResponse.json({ data: output, source: { slug, gammaUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[adapt-slug] failed", { slug, err: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
