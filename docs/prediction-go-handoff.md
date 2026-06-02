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
