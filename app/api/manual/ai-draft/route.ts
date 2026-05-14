import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";

import {
  AiDraftMode,
  SeriesOfEventsDraftSchema,
  SingleEventDraftSchema,
} from "@/lib/manual/ai-schemas";

// The system prompt is intentionally directive: every field downstream of the
// AI is operator-editable, but the operator wants a draft they can ship with
// minimal cleanup. Keep these instructions concrete (do X, here are examples)
// rather than aspirational — Gemini follows specifics far more reliably than
// vague guidance.

const RULES_FORMAT = [
  "OUTPUT FORMAT",
  "- Match the schema EXACTLY. Never invent external_id values — those are server-generated.",
  "- Datetimes are ISO 8601 with timezone (e.g. 2027-01-04T12:00:00Z).",
  "- Slugs are URL-safe, lowercase, hyphenated, max 80 chars. Derive from the title.",
  "- Use `ticker` only when meaningful (recurring series identifier, established event acronym).",
  "- Prefer reasonable defaults: active=true, accepting_orders=true, activation=AUTO.",
].join("\n");

const RULES_DESCRIPTION = [
  "DESCRIPTIONS — do not skimp",
  "- Every event MUST have a `description` of 2-4 sentences. Cover (1) the underlying real-world question,",
  "  (2) the resolution criteria — exactly what observable thing decides YES vs NO,",
  "  (3) the source of truth used for resolution. Don't just restate the title.",
  "- Every market MUST have its own `description` of 2-3 sentences explaining its specific question,",
  "  the threshold or condition, and how it resolves. Markets within the same event should differ in",
  "  their descriptions when their conditions differ — never copy-paste.",
  "- Every series (when applicable) MUST have a 1-2 sentence `description` framing the recurring theme.",
  "- Set `resolution_source` to the URL or named source the resolution will check (e.g.",
  "  https://www.coingecko.com/en/coins/bitcoin, https://en.wikipedia.org/wiki/2027_NBA_Finals).",
].join("\n");

const RULES_TAGS = [
  "TAGS — choose deliberately",
  "- Pick 2-5 tags that best describe the event's subject. Tags are how operators and users find it later.",
  "- Each tag has a URL-safe lowercase slug and a human-readable label (e.g. {slug:'bitcoin', label:'Bitcoin'}).",
  "- Use a top-level category tag PLUS more specific ones. Examples by domain:",
  "    crypto:    {crypto, bitcoin}, {crypto, ethereum, defi}, {crypto, memecoin}",
  "    sports:    {sports, nba, basketball}, {sports, nfl, football}, {sports, soccer, premier-league}",
  "    politics:  {politics, us-election}, {politics, geopolitics}, {politics, scotus}",
  "    finance:   {finance, stocks, earnings}, {finance, fed-rates}, {finance, ipo}",
  "    tech:      {tech, ai}, {tech, hardware}, {tech, big-tech}",
  "    culture:   {culture, awards, oscars}, {culture, music}, {culture, gaming}",
  "- Don't invent niche tags when a common one fits. Don't duplicate tags by slug.",
].join("\n");

const RULES_IMAGES = [
  "IMAGES — use free-to-use sources",
  "- Every event SHOULD have an `icon` URL (the schema field). Pick a stable, license-permissive image.",
  "- Every market SHOULD have an image URL stored in `metadata.image_url` (the market schema has no top-level icon).",
  "- Prefer these sources, in order:",
  "    1. Wikimedia Commons direct file URL: https://upload.wikimedia.org/wikipedia/commons/...",
  "       (use the actual /thumb/ or full-resolution path; e.g.",
  "        https://upload.wikimedia.org/wikipedia/commons/4/46/Bitcoin.svg)",
  "    2. Simple Icons CDN for known brands/logos: https://cdn.simpleicons.org/<slug>",
  "       (e.g. https://cdn.simpleicons.org/bitcoin, /ethereum, /apple, /nba, /tesla)",
  "    3. Unsplash Source for generic topics: https://images.unsplash.com/photo-<id> only when you can",
  "       quote a real photo id; otherwise skip Unsplash rather than guess.",
  "- It is acceptable to leave `icon`/`metadata.image_url` empty if no plausible match exists.",
  "  The operator will verify any URL before publishing. Do not invent random hashes.",
  "- Series icons should reflect the umbrella topic (e.g. a Bitcoin logo for a weekly BTC series).",
  "- Market images may differ from the event icon when each market has a distinct subject (e.g. one",
  "  market per team uses each team's logo).",
].join("\n");

const RULES_METADATA = [
  "METADATA",
  "- `metadata_type` is a short classifier (e.g. 'crypto', 'sports', 'politics'). Match across event + markets.",
  "- `metadata` is a free-form JSON object. For markets, ALWAYS include `image_url` when an image is chosen.",
  "  Other useful keys: `threshold` (for scalar markets), `team`/`player` (for sports), `source_notes` (free text).",
].join("\n");

const RULES_MARKETS = [
  "MARKETS",
  "- Each market is a binary YES/NO question. Set `end_date` to the exact resolution moment.",
  "- If the description implies multiple thresholds (e.g. 'price above 100k, 200k, 500k'), produce one",
  "  market per threshold and reflect the threshold in metadata.threshold.",
  "- For sports per-team or per-outcome events, produce one market per team/outcome.",
  "- Don't duplicate questions. Each market.question must be unique within the event.",
].join("\n");

const SYSTEM_BASE = [
  "You are an assistant that drafts prediction-market payloads for an internal backoffice.",
  "The operator just typed a freeform description. Your job is to produce a complete, ready-to-deploy",
  "draft — they will review and edit, but they should rarely need to fill in basics you skipped.",
  "",
  RULES_FORMAT,
  "",
  RULES_DESCRIPTION,
  "",
  RULES_TAGS,
  "",
  RULES_IMAGES,
  "",
  RULES_METADATA,
  "",
  RULES_MARKETS,
].join("\n");

const SYSTEM_SINGLE = [
  SYSTEM_BASE,
  "",
  "MODE: single-event",
  "Produce one event with one or more markets and a `tags` array.",
  "If the description implies multiple thresholds or outcomes, produce one market per threshold/outcome.",
].join("\n");

const SYSTEM_SERIES = [
  SYSTEM_BASE,
  "",
  "MODE: series-of-events",
  "Produce one series, multiple events (one per recurrence instance), and one or more markets per event.",
  "Use the description to determine recurrence (daily/weekly/monthly). Pick `series.recurrence` accordingly.",
  "Each event in the series should be a distinct instance (one per week, one per match, etc.).",
  "Set `series_type` from {sports, crypto, politics, finance, tech, culture, misc} based on context.",
  "The series-level `tags` apply to the whole series; events inherit semantic context but markets in",
  "different events may have different metadata.image_url (e.g. each weekly market shows a date-",
  "neutral topic image while the series icon stays constant).",
  "Series-level description should frame the recurring theme; each event's description should be",
  "specific to that instance (this week's matchup, this week's threshold, etc.).",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<{
      mode: AiDraftMode;
      description: string;
    }>;
    const mode = body.mode;
    const description = (body.description ?? "").trim();
    if (mode !== "single-event" && mode !== "series-of-events") {
      return NextResponse.json(
        { error: "mode must be 'single-event' or 'series-of-events'" },
        { status: 400 },
      );
    }
    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
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

    // Branch the call so each Output.object resolves to a single concrete
    // schema type — the AI SDK's typings reject the union shape directly.
    if (mode === "single-event") {
      const { output } = await generateText({
        model: google("gemini-2.5-flash"),
        output: Output.object({ schema: SingleEventDraftSchema }),
        system: SYSTEM_SINGLE,
        prompt: `Operator description:\n${description}`,
      });
      return NextResponse.json({ mode, data: output });
    }

    const { output } = await generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema: SeriesOfEventsDraftSchema }),
      system: SYSTEM_SERIES,
      prompt: `Operator description:\n${description}`,
    });
    return NextResponse.json({ mode, data: output });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ai-draft] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
