# prediction-go change handoff

This file records changes needed in **`/Users/tomershaham/Inabit/prediction-go`**. The agent cannot write to that repo; implement these entries in `prediction-go` manually or via a teammate with access.

---

<!-- New entries are appended below by the agent. -->

## 2026-06-02 — Crypto report-payouts from DB candle

**Context:** In backoffice, `Report payouts` for crypto markets should not rely on operator-selected outcomes. After market close + 2 minutes, the server should derive payouts from the relevant 1m candle stored in backoffice DB. If no valid candle/price exists, return an error and do not settle.

**Paths (prediction-go):**
- `/Users/tomershaham/Inabit/prediction-go/apps/backoffice/handlers/manual_markets.go`
- `/Users/tomershaham/Inabit/prediction-go/apps/backoffice/internal/*` (where candle lookup/domain service should live)
- `/Users/tomershaham/Inabit/prediction-go/apps/backoffice/server.go` (only if a new endpoint is introduced)
- `/Users/tomershaham/Inabit/prediction-go/libs/db/ent/*` (if candle table/query helpers need extension)

**Change summary:**
- For crypto CTF oracle payout reporting, compute payouts server-side from DB candle data instead of trusting client-provided payout vectors.
- Enforce eligibility server-side: reject attempts before `market.end_date + 2m`.
- Fetch the relevant 1m candle from DB for the market's resolution timestamp/rules, derive winner (e.g. YES/NO or UP/DOWN), and build payout vector internally.
- If candle is missing/invalid (no row, null/zero/bad close, parse error), return a clear 4xx/5xx error (no state mutation, no payout report call).
- Keep operation idempotent/safe against retries from UI.
- Optional API shape (recommended): keep existing route but allow empty body and ignore client payouts for crypto markets; alternatively add a dedicated auto-resolve endpoint and update backoffice client accordingly.

**Verification:**
- Positive case: market ended > 2m ago, candle exists -> endpoint succeeds and market transitions as expected.
- Too-early case: market not yet at `end_date + 2m` -> endpoint returns validation error, no settlement side effects.
- Missing candle case: remove/mock missing 1m candle -> endpoint returns error, no settlement side effects.
- Invalid candle case: malformed/unusable candle value -> endpoint returns error, no settlement side effects.
- Retry case: repeat same request after successful resolve -> safe/idempotent behavior (no duplicate/incorrect actions).

## 2026-06-02 — UMA resolution status stuck at INITIALIZING (propose/dispute not indexed)

**Context:** The backoffice Resolution Manager buckets markets by the `uma_resolution_status` field returned from the API. For manual UMA markets that have actually been proposed and then disputed on-chain, the API still reports `uma_resolution_status: "INITIALIZING"`. Because of this, a disputed market wrongly lands in the "Not started" tab and can never appear under "Disputed" / "First-time disputed".

**Reproduction (live):** Market `74d047fa-3535-4d2e-ba3b-06e5f6ca1bcd` ("US x Iran permanent peace deal by June 30, 2026?"):
- `GET /manual/markets/74d047fa-.../status` -> `market.uma_resolution_status = "INITIALIZING"`, `deployment_status = "REGISTERED"`.
- `GET /manual/markets/74d047fa-.../outcome` -> `uma_resolution_status = "INITIALIZING"` BUT `proposed = { proposed_price: "1000000000000000000", label: "first_outcome_yes" }`.
- Contradiction: a proposal is recorded (`proposed` populated) yet status is still `INITIALIZING`; the subsequent dispute is not represented in any field at all.

**Paths (prediction-go):**
- `/Users/tomershaham/Inabit/prediction-go/apps/dpm-api/handlers/*` (market status / outcome response builders — confirm where `uma_resolution_status` is read from).
- `/Users/tomershaham/Inabit/prediction-go/libs/...` UMA/CTF adapter event indexer (the worker that listens to ProposePrice / DisputePrice / Settle events and writes `uma_resolution_status`).
- `/Users/tomershaham/Inabit/prediction-go/libs/db/ent/market/*` (the `uma_resolution_status` column + any enum).

**Change summary:**
- Advance `uma_resolution_status` as on-chain UMA lifecycle events are observed:
  - on ProposePrice -> `PROPOSED` (and persist proposed price/label consistently with the `proposed` block already returned by /outcome).
  - on DisputePrice -> `DISPUTED`.
  - on Settle/Resolve -> `RESOLVED` (or `MANUALLY_RESOLVED`).
- Root-cause why a proposal is reflected in the `proposed` block but `uma_resolution_status` stays `INITIALIZING` — these two are being sourced/updated inconsistently. Make the status field authoritative and updated in the same transaction/indexer path that populates `proposed`.
- Ensure dispute state is persisted and exposed via the API (today it appears nowhere in `/status` or `/outcome`).

**Verification:**
- Propose on a fresh UMA market -> `/status` and `/outcome` both report `PROPOSED`; backoffice shows it under "Proposed".
- Dispute the proposed market -> both endpoints report `DISPUTED`; backoffice shows it under "Disputed" (and "First-time disputed" when no prior dispute exists in the operator log).
- Settle -> reports `RESOLVED`/`MANUALLY_RESOLVED`; backoffice shows it under "Settled".
- Re-check market `74d047fa-...`: after backfill/re-index it should report `DISPUTED` (it was proposed then disputed), not `INITIALIZING`.

**Backoffice note:** No backoffice-only fix is possible for the "first-time disputed" expectation because the dispute state is not present in any API field. Once `uma_resolution_status` reflects `DISPUTED`, the existing `bucketUma` + `isFirstTimeDisputed` logic in `lib/aggregations.ts` will route it correctly with no UI change.

## 2026-06-02 — Expose UMA propose attempt count on /outcome

**Context:** The market detail "Key facts" page now shows a "Re-proposed · Nth time" indicator and a `propose_attempts` row, driven by a new `propose_count` field on the market outcome response. The backoffice has no way to derive this today: `/manual/markets/:id/outcome` returns only the latest `proposed` price (no count/history), and the operator log does not record propose/dispute actions. So the indicator stays hidden until the backend returns the count.

**Paths (prediction-go):**
- `/Users/tomershaham/Inabit/prediction-go/apps/dpm-api/handlers/*` — the handler building `GET /markets/by-external-id/:id/outcome` (MarketOutcomeResponse).
- `/Users/tomershaham/Inabit/prediction-go/libs/...` — wherever `uma_requests` (PROPOSE/DISPUTE rows) are persisted/queried.

**Change summary:**
- Add `propose_count` (int) to the `/outcome` response (the `MarketOutcomeResponse` DTO). Value = number of PROPOSE uma_requests recorded for the market (1 on first proposal, 2+ after dispute → re-propose).
- Optionally also include a `dispute_count` and/or a small `uma_request_history` array (`[{kind, price, actor, tx_hash, created_at}]`) so the UI can show full propose/dispute history later.
- Backoffice already consumes `propose_count`: `lib/types.ts` (`MarketOutcome.propose_count`) and `app/markets/[external_id]/page.tsx` (renders `propose_attempts` + "Re-proposed · Nth time" badge when `propose_count >= 2`). No further backoffice change needed once the field is returned.

**Verification:**
- Fresh proposal -> `/outcome` returns `propose_count: 1`; market detail shows `propose_attempts: 1`, no badge.
- Dispute then re-propose -> `/outcome` returns `propose_count: 2`; market detail shows `propose_attempts: 2` and a "Re-proposed · 2nd time" badge in the UMA group.
- Re-check market `74d047fa-...` (proposed, disputed, proposed again) -> should report `propose_count: 2`.

## 2026-06-02 — Expose UMA `liveness` on dpm-api market read responses

**Context:** The Resolution Manager questions table now has a "Liveness" column (the UMA dispute window per market). `liveness` is accepted at creation (MarketPayload) but dpm-api does not echo it back on read, so the column shows "—" until the backend returns it. Confirmed against `GET /manual/markets/:id/status` — the market object has no `liveness` field and `metadata` doesn't contain it either.

**Paths (prediction-go):**
- `/Users/tomershaham/Inabit/prediction-go/apps/dpm-api/handlers/types.go` — `MarketResponse` DTO (add `liveness`).
- `/Users/tomershaham/Inabit/prediction-go/apps/dpm-api/handlers/*` — wherever `MarketResponse` is populated from the ent row.
- `/Users/tomershaham/Inabit/prediction-go/libs/db/ent/market/*` — confirm the `liveness` column exists on the market entity (it's set at creation).

**Change summary:**
- Add `liveness` (string seconds, matching the create payload) to the dpm-api `MarketResponse` so it is returned by the market status/detail endpoints the backoffice consumes (`/manual/markets/:id/status` and the `verdict.market` shape).
- Backoffice already consumes it: `lib/types.ts` (`DpmMarket.liveness`), `lib/market-rows.ts` (`MarketRow.liveness`, hydrated from `dpm.liveness`), and `app/resolutions/_table.tsx` (Liveness column with a seconds→duration formatter). No further backoffice change needed once the field is returned.

**Verification:**
- `GET /manual/markets/:id/status` returns `market.liveness` (e.g. `"7200"`).
- Resolution Manager table "Liveness" column shows the formatted window (e.g. `2h`) instead of "—".

## 2026-06-02 — Persist Polymarket slug on events created from slug (for server-side polling)

**Context:** The backoffice now identifies events that originated from a Polymarket slug by parsing the deploy-plan `note` field (pattern: `"From Polymarket slug: <slug>"`). This works for the current session but is fragile: notes are free-text, and plan notes are only available on plans, not on events or markets directly. For reliable server-side slug tracking (persistent label, faster lookup, background polling), the slug should be persisted directly on the event/market row.

**Current working approach (no prediction-go change needed):**
The backoffice fetches Gamma data on-demand per page load, using the slug extracted from the plan note. This powers:
- Resolution Manager → "Proposed by slug" tab (polls Gamma for every slug plan on each page load).
- Market detail → "Slug resolution" accordion (fetches Gamma for the specific market).
- 5-minute auto-refresh is done client-side via `AutoRefresh` component triggering `router.refresh()`.

**Recommended prediction-go improvements (persistent / scalable):**

**Paths:**
- `/Users/tomershaham/Inabit/prediction-go/libs/db/ent/event/*` — add `polymarket_slug string` (nullable) column to the `events` table.
- `/Users/tomershaham/Inabit/prediction-go/libs/db/ent/market/*` — optionally add `polymarket_market_slug string` (nullable) column to the `markets` table.
- `/Users/tomershaham/Inabit/prediction-go/apps/backoffice/handlers/manual_events.go` — write `polymarket_slug` when creating an event that has a slug in the request (the slug is already passed by the frontend via the `EventPayload` `source_slug` or similar — see below).
- `/Users/tomershaham/Inabit/prediction-go/apps/dpm-api/handlers/types.go` — expose `polymarket_slug` on `EventResponse` and `MarketResponse` so backoffice can use it without parsing plan notes.
- New worker (optional) — `apps/backoffice/workers/polymarket_monitor.go`: cron every 5 min, find all events with `polymarket_slug IS NOT NULL`, call `gamma-api.polymarket.com/events/slug/:slug`, store `polymarket_uma_status + polymarket_uma_statuses` on each market row.

**Change summary:**
1. **EventPayload** — add `polymarket_slug?: string` to the create-event API body. The backoffice already passes `gammaUrl` and `source.slug` in the adapt-slug response; wire this into the event creation call (in `from-slug-form.tsx`'s `startChain`, augment `eventPayload` with `polymarket_slug: slug`).
2. **Event DB row** — persist `polymarket_slug` on create.
3. **API response** — return `polymarket_slug` on `GET /events/:id`, `GET /markets/:id/status`.
4. **Background polling worker** (optional but recommended for production):
   - Every 5 min, for each event with `polymarket_slug`, fetch Gamma and update a `polymarket_resolution_data` JSONB column (or dedicated table) with the latest `umaResolutionStatuses` per market.
   - This removes the on-demand Gamma fetch from the request path (faster page loads) and provides an audit trail.

**Backoffice consumer (no change needed on backoffice side once prediction-go adds the field):**
- `lib/polymarket.ts` → `extractPolymarketSlug` can be replaced with `plan?.polymarket_slug` or `event?.polymarket_slug`.
- The "Proposed by slug" tab and accordion will benefit from cached/server-side resolution data avoiding Gamma round-trips.

**Verification:**
- Create an event via the from-slug form; confirm `GET /events/:id` returns `polymarket_slug: "us-x-iran-..."`.
- Open the market detail for any market in that event; "Slug resolution" accordion should show Gamma data without a noticeable extra delay.
- Background worker (if implemented): after 5 min, Gamma-fetched data should be accessible via new API field without a live Gamma call from the backoffice.
