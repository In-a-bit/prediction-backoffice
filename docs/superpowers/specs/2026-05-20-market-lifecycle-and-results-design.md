# Market Lifecycle + Factual Outcome Surfaces

Date: 2026-05-20
Status: Approved (verbal) — ready to plan & implement

## Goal

Make a market's lifecycle status and resolution result legible at every level
of the backoffice — list rows, market detail, event detail. Add a factual
outcome block on event surfaces so the operator can see the real-world fact
the market was resolved against (final score for sport, price move for
crypto). No event-level "won/lost" aggregate — events host many markets, so
that summary is meaningless.

## Surfaces touched

| File | Change |
|---|---|
| `components/market-lifecycle.tsx` (new) | `LifecycleStepper`, `ResultChip` |
| `components/event-outcome.tsx` (new) | `SportOutcomeBlock`, `CryptoOutcomeBlock`, inline string helpers |
| `lib/market-lifecycle.ts` (new) | Pure helpers: `deriveLifecycle`, `deriveResult`, `extractSportScore`, `extractCryptoOutcome` |
| `app/markets/page.tsx` | Row card: replace status badges with `LifecycleStepper variant="compact"` + `ResultChip` |
| `app/markets/[external_id]/page.tsx` | Replace `StatusStrip` with `LifecycleHeader` (stepper + result + factual outcome block). New `crypto_event_id` search param. Sport: hop `sport_market_id` → `getMarketStatus` → `getEvent` to load decisions + score. |
| `app/events/[external_id]/page.tsx` | Add `<EventOutcomeBlock>` under the aggregate strip. Replace per-market card status row with `LifecycleStepper compact` + `ResultChip`. Drop the noisy 4-badge chip line. |
| `app/events/page.tsx` | Append inline outcome line to crypto/sport row subtitles only. |

## Lifecycle model

```ts
type LifecycleStageKey = "created" | "proposed" | "resolved";
type LifecycleStageStatus =
  | "pending"    // not started
  | "active"     // in progress (e.g. proposing, resolving)
  | "done"       // completed
  | "failed"     // stage errored
  | "skipped";   // skipped (cancelled / refunded path)

type ResultKind =
  | "won"        // ✓ this market's outcome was correct
  | "lost"       // ✗ this market's outcome was wrong
  | "refund"     // ↺ 50/50 / no-decision / cancelled
  | "pending"    // — not yet resolved
  | "na";        // — manual market with no decision pipeline
```

### Mapping per source

**Sport** (`SportMarket.local_status`):

| local_status | created | proposed | resolved | result |
|---|---|---|---|---|
| `pending` | active | pending | pending | pending |
| `created` | done | pending | pending | pending |
| `proposing` | done | active | pending | pending |
| `proposed` | done | done | pending | pending |
| `resolving` | done | done | active | pending |
| `resolved` | done | done | done | derived from decision |
| `refunded` | done | done | done (skipped) | refund |
| `cancelled` | done | skipped | skipped | refund |
| `failed` | current stage → failed | — | — | pending |

Result derivation: `proposed_prices[outcome_key]`. `1e18` → won, `0` → lost,
`5e17` → refund. `decision.decision_kind === "refund_5050"` forces refund.
Reason string: `"Decision: home_win=YES → this market (away_win) lost"`.

**Crypto** (`CryptoMarket.local_status`):

| local_status | created | proposed | resolved | result |
|---|---|---|---|---|
| `pending` | active | pending | pending | pending |
| `created` | done | pending | pending | pending |
| `verified` | done | done | pending | pending |
| `resolving` | done | done | active | pending |
| `resolved` | done | done | done | derived from decision |
| `cancelled` | done | skipped | skipped | refund |
| `failed` | current stage → failed | — | — | pending |

Result derivation: `cryptoEvent.decision.outcome` (`"up"` / `"down"`) vs.
suffix of `cryptoMarket.market_slug`. Match → won, mismatch → lost. If slug
has neither suffix → result `pending` (graceful fallback).

**Manual** (`DeployPlanMarket.status` + `MarketStatusVerdict`):

Lifecycle inferred from `verdict.status` and `verdict.market.uma_resolution_status`:
- `verdict.status === "deployed"` → created done.
- `uma_resolution_status === "proposed"` → proposed done.
- `uma_resolution_status === "resolved"` → resolved done.
- `verdict.status === "failed"` → current stage failed.

Manual markets always emit `result: "na"`. UI renders no result chip.

## Components

### `<LifecycleStepper>`

Props:
```ts
{
  stages: { key: LifecycleStageKey; status: LifecycleStageStatus }[];
  variant?: "compact" | "full";  // default: "full"
}
```

Compact (row cards):
```
●——●——○        ← dots + connector lines, no labels
Created Proposed Resolved   ← screen-reader only
```

Full (detail header):
```
 ●          ●          ○
─────────────────────────
Created    Proposed   Resolved
done       done       pending
```

Tones via existing Badge palette: `done` = success, `active` = info (pulsing
dot), `pending` = neutral, `failed` = danger, `skipped` = warning. Connector
line picks up the **incoming** stage's tone.

### `<ResultChip>`

Props: `{ result: { kind: ResultKind; label: string; reason?: string } }`.
Renders nothing when kind is `"na"`. Otherwise:

| kind | display | tone |
|---|---|---|
| won | `✓ Won` | success |
| lost | `✗ Lost` | danger |
| refund | `↺ Refund` | warning |
| pending | `— Pending` | neutral |

`reason` becomes `title=...` for hover; on the detail page it renders as
muted text under the chip.

### `<EventOutcomeBlock>` — sport variant

```
┌─────────────────────────────────────────┐
│  Arsenal      2  —  1   Chelsea     FT  │
│                                          │
│  Halftime:    1  —  0                   │
└─────────────────────────────────────────┘
```

Pulled from `SportEvent.fixture_payload`:
- Teams: `payload.teams.home.name`, `payload.teams.away.name`.
- Final: `payload.score.fulltime.{home,away}` (fallback `payload.goals`).
- Half: `payload.score.halftime.{home,away}`.
- Status: `payload.fixture.status.short` (FT, HT, NS, 1H, 2H, etc.).

If final score is null → "Match not finished (status: 1H)".

### `<EventOutcomeBlock>` — crypto variant

```
┌────────────────────────────────────────────┐
│  $67,420.50  →  $67,891.20    ▲  UP        │
│                              +0.70%        │
└────────────────────────────────────────────┘
```

Inputs: `CryptoEvent.price_to_beat`, `price_at_close`, `decision.outcome`.

- Arrow color: green for UP, red for DOWN, gray "—" if no decision.
- Percent computed client-side: `(close - open) / open * 100`.
- If `price_at_close` missing → "Awaiting close price…" with gray arrow.

### Inline outcome string (event list rows)

- Sport: `"Arsenal 2-1 Chelsea (FT)"` or `"1-0 (HT)"` if mid-match.
- Crypto: `"$67,420 → $67,891 ▲ UP"` or `"$67,420 → … pending"`.

## Data fetching

### `/markets` list

Both `cryptoRows` and `sportRows` already iterate parent events. Pass the
parent event + decision into `rowFromCrypto` / `rowFromSport`. Server-side
call `deriveLifecycle` + `deriveResult`; attach to the `Row` type:

```ts
type Row = {
  ...existing fields,
  lifecycle: { stages: ... };
  result: { kind: ...; label: string; reason?: string };
};
```

Manual rows get `lifecycle` derived from plan status alone (no verdict
fetch — list page would balloon to N HTTP calls).

### `/markets/[external_id]`

New optional search param: `crypto_event_id` (numeric). Already have
`sport_market_id`.

- Source = sport, `sport_market_id` present: `sports.getMarketStatus(id)` →
  extract `event_id` → `sports.getEvent(event_id)`.
- Source = crypto, `crypto_event_id` present: `crypto.getCryptoEvent(id)`.
- Both calls are best-effort; on failure the lifecycle still renders without
  the outcome block.

Upstream links (event-detail market card, deploy-plan driver) need to thread
the new param. Out-of-scope upstream links keep working without the outcome
block.

### `/events/[external_id]`

Scan helper `findParentSportOrCryptoEvent(externalId)`:
1. If source != sport && source != crypto → skip.
2. List sport/crypto tasks (already cached by Next.js).
3. For each task, list events. Match by `event_external_id`.
4. Cap: scan at most 10 tasks total, short-circuit on first match.
5. Cache result for the request via a request-scoped Map.

If found → render `<EventOutcomeBlock>` above the markets section.

### `/events` list

Same data the existing loaders already pull. Add inline outcome string to
`subtitle` for crypto/sport rows. No new requests.

## Replacement / removal

- `StatusStrip` in `app/markets/[external_id]/page.tsx` — **removed**.
  Replaced by the new `LifecycleHeader`. The deploy-status / uma-status /
  type info collapses into the lifecycle stepper + result chip + outcome
  block; the rest remains in `KeyFactsGrid`.
- The 4-status chip line in `app/events/[external_id]/page.tsx` MarketCard
  (`plan: / verdict: / deploy: / uma:`) — **removed**, replaced by the
  compact lifecycle stepper + result chip. The raw values stay accessible
  in the expandable "Details" details.

## Edge cases & failure modes

- Sport event with no `decisions[]` yet but `local_status === "resolved"`:
  shows resolved-done lifecycle, result = `pending` with reason "Awaiting
  decision record".
- Sport market with `outcome_key` not present in `proposed_prices`: result =
  `pending` with reason "Outcome not in decision".
- Crypto market with slug not ending in `-up`/`-down`: result = `pending`
  with reason "Could not match market slug to decision outcome".
- `fixture_payload` shape variance (api-football returns deeply nested
  records): use defensive `unknown` traversal with `typeof` guards. Wrap in
  try/catch returning `null` so the page never crashes on a malformed
  payload.

## Out of scope

- Backend endpoint changes (no new routes added).
- Crypto event-by-external-id lookup endpoint (would be cleaner than the
  task scan; punted).
- Per-market action panel changes — actions stay where they are.
- Bulk operator views (operator-log, deploy-plans list) — left untouched.

## Non-goals

- Animations beyond a single pulsing dot on the `active` stage. No
  micro-interactions, no chart libraries.
- Reactive auto-refresh of lifecycle. Existing page-level auto-refresh
  (where present) is enough.
