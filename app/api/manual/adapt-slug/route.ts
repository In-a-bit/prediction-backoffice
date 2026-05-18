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

// Description fields are large, authoritative on the Polymarket side, and
// re-generating them with the LLM wastes tokens for no quality gain. We
// strip them from the input we send to Gemini and copy them back into the
// AI output verbatim afterward, matching by slug. Same for icons / images,
// which are also taken verbatim from the source. The AI is reduced to the
// structural / classification work it actually adds value on (tags slug
// inference, metadata_type, schema mapping, etc.).
const SOURCE_KEYS_TO_STRIP_FROM_INPUT: ReadonlyArray<string> = [
  // long, copy-back-verbatim
  "description",
  "resolutionDescription",
  "outcomePrices",
  "outcomes",
  "clobTokenIds",
  "umaResolutionStatuses",
  // order-book / volume noise the AI doesn't need to reason about
  "volume",
  "volume24hr",
  "volumeWeek",
  "volumeMonth",
  "liquidity",
  "openInterest",
  "competitive",
  "spread",
  "lastTradePrice",
  "bestBid",
  "bestAsk",
  "oneDayPriceChange",
  "oneHourPriceChange",
  "oneWeekPriceChange",
  "oneMonthPriceChange",
];

// Walk an object/array recursively and drop any keys in `keys`. Returns a
// new structure; does not mutate the input. Strings and numbers pass through.
function stripKeys(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripKeys(v, keys));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keys.has(k)) continue;
      out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return value;
}

// VerbatimSource captures the description + image fields from the gamma
// payload that we re-attach to the AI output without ever sending to the LLM.
type VerbatimSource = {
  event: { description?: string; icon?: string; image?: string };
  // Keyed by market slug — that's the stable identifier across the AI hop.
  markets: Map<
    string,
    { description?: string; icon?: string; image?: string }
  >;
  series: { description?: string; icon?: string; image?: string };
};

function extractVerbatim(polymarket: any): VerbatimSource {
  const out: VerbatimSource = {
    event: {
      description: polymarket?.description,
      icon: polymarket?.icon,
      image: polymarket?.image,
    },
    markets: new Map(),
    series: {},
  };
  for (const m of (polymarket?.markets ?? []) as any[]) {
    if (!m?.slug) continue;
    out.markets.set(m.slug, {
      description: m.description,
      icon: m.icon,
      image: m.image,
    });
  }
  // Polymarket's series shape varies; pull from the first (or only) entry
  // when present, leaving everything undefined when there is no series.
  const series = polymarket?.series?.[0] ?? polymarket?.series;
  if (series && typeof series === "object") {
    out.series = {
      description: series.description,
      icon: series.icon,
      image: series.image,
    };
  }
  return out;
}

// patchVerbatim attaches the stripped-out descriptions / icons back onto the
// AI output. The AI is told to preserve slugs verbatim from the source, so
// the slug match is reliable. Anything the AI emitted in those fields is
// overwritten with the source — this is intentional and the whole point of
// the optimization (cheaper + closer to source).
function patchVerbatim(
  out: AdaptSlugResult,
  src: VerbatimSource,
): AdaptSlugResult {
  if (out.event) {
    if (src.event.description) out.event.description = src.event.description;
    const eventIcon = src.event.icon ?? src.event.image;
    if (eventIcon) out.event.icon = eventIcon;
  }
  for (const m of out.markets) {
    if (!m.slug) continue;
    const srcMarket = src.markets.get(m.slug);
    if (!srcMarket) continue;
    if (srcMarket.description) m.description = srcMarket.description;
    const marketImage = srcMarket.icon ?? srcMarket.image;
    if (marketImage) {
      // Markets have no top-level icon field — store under metadata.image_url
      // so the existing UI surfaces it without schema changes.
      m.metadata = { ...(m.metadata ?? {}), image_url: marketImage };
    }
  }
  if (out.series) {
    if (src.series.description) out.series.description = src.series.description;
    const seriesIcon = src.series.icon ?? src.series.image;
    if (seriesIcon) out.series.icon = seriesIcon;
  }
  return out;
}

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

    // Capture descriptions / icons FIRST, then strip them so the AI never
    // sees them. This roughly halves the input size on typical slugs and
    // eliminates the AI's output cost for re-emitting those long fields.
    const verbatim = extractVerbatim(polymarket);
    const stripped = stripKeys(
      polymarket,
      new Set(SOURCE_KEYS_TO_STRIP_FROM_INPUT),
    );

    const promptInput = JSON.stringify(stripped).slice(0, 180_000);

    const { output } = await generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema: AdaptResultSchema }),
      system: [
        "You convert a Polymarket gamma API event payload into our internal Series/Event/Market payload shape.",
        "Polymarket is the source of truth — preserve its data faithfully.",
        "",
        "PERFORMANCE NOTE — DESCRIPTIONS AND ICONS ARE PATCHED IN POST-PROCESSING",
        "- The input payload below has been STRIPPED of all `description`, `resolutionDescription`, `icon`,",
        "  `image`, and order-book fields. Server-side post-processing will copy those values verbatim from",
        "  the original Polymarket payload back onto your output, matched by slug.",
        "- DO NOT attempt to write descriptions or pick image URLs. Leave `description` and `icon` fields",
        "  empty / omitted in your output. Whatever you put there will be discarded.",
        "- Focus your work on the structural / classification fields you actually drive.",
        "",
        "OUTPUT FORMAT",
        "- Match the schema EXACTLY. Never include external IDs from Polymarket — our system generates them.",
        "- Convert all datetime fields to ISO 8601 with timezone.",
        "- Skip markets with closed=true UNLESS the entire event has only closed markets, in which case include them all.",
        "",
        "TITLES, SLUGS, DATES, FLAGS",
        "- Preserve slugs and titles verbatim. Slugs are the join key for the post-processing step — must match",
        "  the source EXACTLY.",
        "- event.neg_risk mirrors Polymarket negRisk.",
        "- For each market copy: question, slug, resolution_source (from resolutionSource),",
        "  start_date/end_date, neg_risk, accepting_orders, funded, approved, rfq_enabled,",
        "  order_price_min_tick_size (orderPriceMinTickSize), order_min_size (orderMinSize),",
        "  uma_bond (umaBond), uma_reward (umaReward).",
        "",
        "TAGS",
        "- Tags: emit {slug, label} verbatim from the Polymarket tags[] array. Drop duplicates by slug.",
        "- Do NOT invent tags that are not in the payload.",
        "",
        "METADATA",
        "- event.metadata_type: short classifier inferred from tags (e.g. 'politics', 'sports', 'crypto').",
        "- event.metadata: the Polymarket eventMetadata object verbatim if present, otherwise an empty object.",
        "- market.metadata_type matches event.metadata_type.",
        "- market.metadata MAY include {polymarket_group_item_title, polymarket_group_item_threshold} when",
        "  groupItemTitle/Threshold exist. (image_url is filled in post-processing — do not emit it.)",
        "",
        "SERIES",
        "- Series: only emit when the payload has a real series/parent grouping. Otherwise return null.",
      ].join("\n"),
      prompt: `Polymarket gamma event payload (JSON, descriptions+icons stripped):\n${promptInput}`,
    });

    // Re-attach the verbatim source content the AI never saw.
    const patched = patchVerbatim(output as AdaptSlugResult, verbatim);

    return NextResponse.json({ data: patched, source: { slug, gammaUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[adapt-slug] failed", { slug, err: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
