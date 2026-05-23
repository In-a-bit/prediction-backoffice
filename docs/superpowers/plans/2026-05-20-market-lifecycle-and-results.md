# Market Lifecycle & Factual Outcome Surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a market's lifecycle (Created → Proposed → Resolved) and its win/lose result visible on every market card and detail page, and surface the real-world factual outcome (sport score / crypto price move) on event surfaces.

**Architecture:** One pure helper module (`lib/market-lifecycle.ts`) derives lifecycle stage + result from existing API types. Two presentational component files (`components/market-lifecycle.tsx`, `components/event-outcome.tsx`) render those derivations. Existing pages (`/markets`, `/markets/[external_id]`, `/events`, `/events/[external_id]`) are surgically modified to call the helpers and render the components — no new API endpoints, no new data sources.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4. Project has no test framework, so verification is `npx tsc --noEmit` + `npm run lint` + manual browser verification per task.

**Spec:** `docs/superpowers/specs/2026-05-20-market-lifecycle-and-results-design.md`

**Pre-flight (run once before starting):**
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: both pass cleanly. This is the baseline for each subsequent task.

---

## File Structure

| File | Role | New / Modified |
|---|---|---|
| `lib/market-lifecycle.ts` | Pure derivation helpers (types + functions). Zero React, zero IO. | Create |
| `components/market-lifecycle.tsx` | `LifecycleStepper`, `ResultChip` server components. | Create |
| `components/event-outcome.tsx` | `SportOutcomeBlock`, `CryptoOutcomeBlock`, `inlineSportOutcome()`, `inlineCryptoOutcome()`. | Create |
| `app/markets/page.tsx` | Replace status badges with stepper + chip per row. Crypto/sport loaders pass parent event + decision into row builders. | Modify |
| `app/markets/[external_id]/page.tsx` | Replace `StatusStrip` with lifecycle header + outcome block. Add `crypto_event_id` search param. | Modify |
| `app/events/[external_id]/page.tsx` | Add outcome block under aggregate strip; per-market card swaps the 4-badge line for stepper + chip. | Modify |
| `app/events/page.tsx` | Append inline outcome string to crypto/sport row subtitles. | Modify |

---

## Task 1: Pure lifecycle + result derivation helpers

**Files:**
- Create: `lib/market-lifecycle.ts`

- [ ] **Step 1: Create the helper module with types and per-source derivation**

Create `lib/market-lifecycle.ts` with this exact content:

```ts
// Pure helpers for deriving lifecycle stage and per-market result. No React,
// no IO — feed in the API types you already have and get back display data.
// Spec: docs/superpowers/specs/2026-05-20-market-lifecycle-and-results-design.md

import type {
  CryptoEvent,
  CryptoMarket,
  DeployPlanMarket,
  MarketStatusVerdict,
  SportDecision,
  SportEvent,
  SportMarket,
  SportMarketStatus,
  CryptoEventMarketStatus,
} from "@/lib/types";
import type { PlanSource } from "@/lib/source-from-plan";

export type LifecycleStageKey = "created" | "proposed" | "resolved";

export type LifecycleStageStatus =
  | "pending"
  | "active"
  | "done"
  | "failed"
  | "skipped";

export type LifecycleStage = {
  key: LifecycleStageKey;
  status: LifecycleStageStatus;
};

export type Lifecycle = {
  stages: LifecycleStage[];
};

export type ResultKind = "won" | "lost" | "refund" | "pending" | "na";

export type Result = {
  kind: ResultKind;
  label: string;
  reason?: string;
};

const PRICE_YES = "1000000000000000000";
const PRICE_NO = "0";
const PRICE_5050 = "500000000000000000";

// ---------------------------------------------------------------------------
// Sport
// ---------------------------------------------------------------------------

const SPORT_STAGE_TABLE: Record<
  SportMarketStatus,
  [LifecycleStageStatus, LifecycleStageStatus, LifecycleStageStatus]
> = {
  pending:    ["active",  "pending", "pending"],
  created:    ["done",    "pending", "pending"],
  proposing:  ["done",    "active",  "pending"],
  proposed:   ["done",    "done",    "pending"],
  resolving:  ["done",    "done",    "active"],
  resolved:   ["done",    "done",    "done"],
  refunded:   ["done",    "done",    "skipped"],
  cancelled:  ["done",    "skipped", "skipped"],
  failed:     ["failed",  "pending", "pending"],
};

export function deriveSportLifecycle(market: SportMarket): Lifecycle {
  const row = SPORT_STAGE_TABLE[market.local_status] ?? SPORT_STAGE_TABLE.pending;
  return {
    stages: [
      { key: "created",  status: row[0] },
      { key: "proposed", status: row[1] },
      { key: "resolved", status: row[2] },
    ],
  };
}

export function deriveSportResult(
  market: SportMarket,
  decision?: SportDecision,
): Result {
  if (market.local_status === "cancelled") {
    return { kind: "refund", label: "Cancelled", reason: "Market was cancelled" };
  }
  if (market.local_status === "refunded") {
    return { kind: "refund", label: "Refunded", reason: "50/50 refund" };
  }
  if (market.local_status !== "resolved") {
    return { kind: "pending", label: "Pending" };
  }
  if (!decision) {
    return { kind: "pending", label: "Pending", reason: "Awaiting decision record" };
  }
  if (decision.decision_kind === "refund_5050") {
    return { kind: "refund", label: "Refunded", reason: "50/50 refund decision" };
  }
  const price = decision.proposed_prices[market.outcome_key];
  if (price === undefined) {
    return {
      kind: "pending",
      label: "Pending",
      reason: `Outcome ${market.outcome_key} not present in decision`,
    };
  }
  if (price === PRICE_YES) {
    return {
      kind: "won",
      label: "Won",
      reason: `Decision priced ${market.outcome_key} = YES`,
    };
  }
  if (price === PRICE_NO) {
    return {
      kind: "lost",
      label: "Lost",
      reason: `Decision priced ${market.outcome_key} = NO`,
    };
  }
  if (price === PRICE_5050) {
    return {
      kind: "refund",
      label: "Refunded",
      reason: `Decision priced ${market.outcome_key} = 50/50`,
    };
  }
  return {
    kind: "pending",
    label: "Pending",
    reason: `Unrecognized price ${price}`,
  };
}

// Resolves the decision that applies to a given sport market. SportEvent
// carries an array of decisions keyed by market_type — pick the one matching
// the market's sport_market_type_id.
export function findSportDecisionFor(
  event: SportEvent | undefined,
  market: SportMarket,
): SportDecision | undefined {
  if (!event?.decisions) return undefined;
  return event.decisions.find(
    (d) => d.sport_market_type_id === market.sport_market_type_id,
  );
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

const CRYPTO_STAGE_TABLE: Record<
  CryptoEventMarketStatus,
  [LifecycleStageStatus, LifecycleStageStatus, LifecycleStageStatus]
> = {
  pending:    ["active",  "pending", "pending"],
  created:    ["done",    "pending", "pending"],
  verified:   ["done",    "done",    "pending"],
  resolving:  ["done",    "done",    "active"],
  resolved:   ["done",    "done",    "done"],
  cancelled:  ["done",    "skipped", "skipped"],
  failed:     ["failed",  "pending", "pending"],
};

export function deriveCryptoLifecycle(market: CryptoMarket): Lifecycle {
  const row = CRYPTO_STAGE_TABLE[market.local_status] ?? CRYPTO_STAGE_TABLE.pending;
  return {
    stages: [
      { key: "created",  status: row[0] },
      { key: "proposed", status: row[1] },
      { key: "resolved", status: row[2] },
    ],
  };
}

export function deriveCryptoResult(
  market: CryptoMarket,
  event?: CryptoEvent,
): Result {
  if (market.local_status === "cancelled") {
    return { kind: "refund", label: "Cancelled", reason: "Market was cancelled" };
  }
  if (market.local_status !== "resolved") {
    return { kind: "pending", label: "Pending" };
  }
  const outcome = event?.decision?.outcome;
  if (!outcome) {
    return { kind: "pending", label: "Pending", reason: "Awaiting decision record" };
  }
  const slugLower = market.market_slug.toLowerCase();
  let marketSide: "up" | "down" | undefined;
  if (slugLower.endsWith("-up") || slugLower.endsWith("_up")) marketSide = "up";
  else if (slugLower.endsWith("-down") || slugLower.endsWith("_down")) marketSide = "down";
  if (!marketSide) {
    return {
      kind: "pending",
      label: "Pending",
      reason: `Could not match slug ${market.market_slug} to up/down`,
    };
  }
  if (marketSide === outcome) {
    return {
      kind: "won",
      label: "Won",
      reason: `Outcome was ${outcome.toUpperCase()} and this market is ${marketSide.toUpperCase()}`,
    };
  }
  return {
    kind: "lost",
    label: "Lost",
    reason: `Outcome was ${outcome.toUpperCase()} but this market is ${marketSide.toUpperCase()}`,
  };
}

// ---------------------------------------------------------------------------
// Manual
// ---------------------------------------------------------------------------

export function deriveManualLifecycle(
  planMarket?: DeployPlanMarket,
  verdict?: MarketStatusVerdict,
): Lifecycle {
  // Created stage — driven by plan status + verdict.
  let created: LifecycleStageStatus = "pending";
  if (planMarket?.status === "deployed" || verdict?.status === "deployed") {
    created = "done";
  } else if (
    planMarket?.status === "submitting" ||
    planMarket?.status === "running" ||
    planMarket?.status === "waiting_for_balance" ||
    verdict?.status === "running" ||
    verdict?.status === "deploying" ||
    verdict?.status === "waiting_for_balance"
  ) {
    created = "active";
  } else if (planMarket?.status === "failed" || verdict?.status === "failed") {
    created = "failed";
  } else if (planMarket?.status === "skipped") {
    created = "skipped";
  }

  // Proposed / resolved — driven by uma_resolution_status when available.
  const uma = verdict?.market?.uma_resolution_status?.toLowerCase();
  let proposed: LifecycleStageStatus = "pending";
  let resolved: LifecycleStageStatus = "pending";
  if (uma === "proposed") {
    proposed = "done";
  } else if (uma === "disputed") {
    proposed = "failed";
  } else if (uma === "resolved" || uma === "settled") {
    proposed = "done";
    resolved = "done";
  }
  // If created hasn't completed, downstream stages stay pending.
  if (created !== "done") {
    proposed = proposed === "pending" ? "pending" : proposed;
    resolved = resolved === "pending" ? "pending" : resolved;
  }

  return {
    stages: [
      { key: "created",  status: created },
      { key: "proposed", status: proposed },
      { key: "resolved", status: resolved },
    ],
  };
}

export function deriveManualResult(): Result {
  // Manual markets have no automated decision pipeline. We could read
  // uma_resolution_status but the operator already sees that in the lifecycle
  // stepper; emitting "na" keeps the result chip off the UI for these rows.
  return { kind: "na", label: "" };
}

// ---------------------------------------------------------------------------
// Unified dispatcher
// ---------------------------------------------------------------------------

export type DeriveInput =
  | { source: "sport"; sportMarket: SportMarket; sportEvent?: SportEvent }
  | { source: "crypto"; cryptoMarket: CryptoMarket; cryptoEvent?: CryptoEvent }
  | {
      source: "manual";
      planMarket?: DeployPlanMarket;
      verdict?: MarketStatusVerdict;
    };

export function derive(
  input: DeriveInput,
): { lifecycle: Lifecycle; result: Result } {
  if (input.source === "sport") {
    const decision = findSportDecisionFor(input.sportEvent, input.sportMarket);
    return {
      lifecycle: deriveSportLifecycle(input.sportMarket),
      result: deriveSportResult(input.sportMarket, decision),
    };
  }
  if (input.source === "crypto") {
    return {
      lifecycle: deriveCryptoLifecycle(input.cryptoMarket),
      result: deriveCryptoResult(input.cryptoMarket, input.cryptoEvent),
    };
  }
  return {
    lifecycle: deriveManualLifecycle(input.planMarket, input.verdict),
    result: deriveManualResult(),
  };
}

// Sanity helper: ensure the source string is one of the three known values.
export function isPlanSource(s: unknown): s is PlanSource {
  return s === "sport" || s === "crypto" || s === "manual";
}
```

- [ ] **Step 2: Type-check and lint**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: zero errors. If `findSportDecisionFor` complains that `decision.sport_market_type_id` doesn't exist on `SportDecision`, open `lib/types.ts` and verify the field is `sport_market_type_id: number` (line 573 in current source). It is.

- [ ] **Step 3: Commit**

```bash
git add lib/market-lifecycle.ts
git commit -m "feat: add pure market lifecycle + result derivation helpers"
```

---

## Task 2: Lifecycle stepper + result chip components

**Files:**
- Create: `components/market-lifecycle.tsx`

- [ ] **Step 1: Create the component file**

Create `components/market-lifecycle.tsx` with this exact content:

```tsx
// Visual representation of a market's lifecycle and final result. Pure
// presentational — feed it the output of lib/market-lifecycle.ts and forget.

import type {
  Lifecycle,
  LifecycleStage,
  LifecycleStageStatus,
  Result,
} from "@/lib/market-lifecycle";

const STAGE_LABELS: Record<LifecycleStage["key"], string> = {
  created: "Created",
  proposed: "Proposed",
  resolved: "Resolved",
};

const DOT_TONE: Record<LifecycleStageStatus, string> = {
  pending:  "bg-foreground/15 border border-foreground/20",
  active:   "bg-info border border-info animate-pulse",
  done:     "bg-success border border-success",
  failed:   "bg-danger border border-danger",
  skipped:  "bg-warning border border-warning",
};

// The connector line picks up the *incoming* stage's tone so the bar to the
// LEFT of the Proposed dot reflects the Created stage. Pending → faint.
const LINE_TONE: Record<LifecycleStageStatus, string> = {
  pending:  "bg-foreground/10",
  active:   "bg-info/40",
  done:     "bg-success/60",
  failed:   "bg-danger/60",
  skipped:  "bg-warning/40",
};

export function LifecycleStepper({
  lifecycle,
  variant = "full",
}: {
  lifecycle: Lifecycle;
  variant?: "compact" | "full";
}) {
  const stages = lifecycle.stages;
  if (variant === "compact") {
    return (
      <div
        className="inline-flex items-center gap-0"
        role="img"
        aria-label={a11yLabel(stages)}
      >
        {stages.map((s, i) => (
          <span key={s.key} className="inline-flex items-center">
            <span className={`block w-2 h-2 rounded-full ${DOT_TONE[s.status]}`} />
            {i < stages.length - 1 ? (
              <span className={`block w-3 h-0.5 ${LINE_TONE[s.status]}`} />
            ) : null}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-0 w-full" aria-label={a11yLabel(stages)}>
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-start flex-1 last:flex-initial">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <span
              className={`block w-3.5 h-3.5 rounded-full ${DOT_TONE[s.status]}`}
            />
            <div className="text-center">
              <div className="text-[11px] font-medium text-foreground leading-tight">
                {STAGE_LABELS[s.key]}
              </div>
              <div className="text-[10px] text-foreground-muted leading-tight">
                {s.status}
              </div>
            </div>
          </div>
          {i < stages.length - 1 ? (
            <span
              className={`mt-[7px] h-0.5 flex-1 mx-2 ${LINE_TONE[s.status]}`}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ResultChip({
  result,
  showReason = false,
}: {
  result: Result;
  showReason?: boolean;
}) {
  if (result.kind === "na") return null;

  const map: Record<
    Exclude<Result["kind"], "na">,
    { glyph: string; classes: string }
  > = {
    won: {
      glyph: "✓",
      classes:
        "bg-success/15 text-success border-success/40",
    },
    lost: {
      glyph: "✗",
      classes:
        "bg-danger/15 text-danger border-danger/40",
    },
    refund: {
      glyph: "↺",
      classes:
        "bg-warning/15 text-warning border-warning/40",
    },
    pending: {
      glyph: "—",
      classes:
        "bg-foreground/5 text-foreground-muted border-foreground/15",
    },
  };
  const m = map[result.kind];
  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={result.reason ?? result.label}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.classes}`}
      >
        <span aria-hidden>{m.glyph}</span>
        <span>{result.label}</span>
      </span>
      {showReason && result.reason ? (
        <span className="text-[11px] text-foreground-muted">
          {result.reason}
        </span>
      ) : null}
    </span>
  );
}

function a11yLabel(stages: LifecycleStage[]): string {
  return stages.map((s) => `${STAGE_LABELS[s.key]}: ${s.status}`).join(", ");
}
```

- [ ] **Step 2: Verify the new color utility classes exist**

The component uses Tailwind classes `bg-success`, `bg-danger`, `bg-warning`, `bg-info`, `text-success`, `text-danger`, `text-warning`, and `text-foreground-muted`. Verify they're defined in `app/globals.css`:

```bash
grep -E "success|danger|warning|info|foreground-muted" /home/yuvala/Documents/prediction-claude/prediction-backoffice/app/globals.css | head -20
```

Expected: lines defining these as CSS variables / Tailwind theme tokens. If `bg-success` etc. aren't auto-generated by Tailwind v4's `@theme` block, you'll see them defined explicitly. If any are missing, add a fallback by editing the component to use the existing tone strings used by the Badge component (re-read `components/ui.tsx:74-95` to find the actual class names — they're things like `bg-emerald-100 text-emerald-700 border-emerald-200` etc.) and substitute them in.

- [ ] **Step 3: Type-check and lint**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/market-lifecycle.tsx
git commit -m "feat: add LifecycleStepper and ResultChip components"
```

---

## Task 3: Factual outcome blocks (sport + crypto)

**Files:**
- Create: `components/event-outcome.tsx`

- [ ] **Step 1: Create the component file**

Create `components/event-outcome.tsx` with this exact content:

```tsx
// Factual outcome block — shows the real-world fact a market resolves
// against. Sport: team names + final/halftime score. Crypto: open→close
// price + direction. Defensive against api-football payload shape drift.

import type { CryptoEvent, SportEvent } from "@/lib/types";

// ---------------------------------------------------------------------------
// Sport
// ---------------------------------------------------------------------------

type SportScore = {
  homeName: string;
  awayName: string;
  fullHome: number | null;
  fullAway: number | null;
  halfHome: number | null;
  halfAway: number | null;
  statusShort: string;
};

export function extractSportScore(event: SportEvent | undefined): SportScore | null {
  if (!event?.fixture_payload) return null;
  try {
    const payload = event.fixture_payload as Record<string, unknown>;
    const teams = (payload.teams ?? {}) as Record<string, unknown>;
    const home = (teams.home ?? {}) as Record<string, unknown>;
    const away = (teams.away ?? {}) as Record<string, unknown>;
    const score = (payload.score ?? {}) as Record<string, unknown>;
    const goals = (payload.goals ?? {}) as Record<string, unknown>;
    const fulltime = (score.fulltime ?? {}) as Record<string, unknown>;
    const halftime = (score.halftime ?? {}) as Record<string, unknown>;
    const fixture = (payload.fixture ?? {}) as Record<string, unknown>;
    const status = (fixture.status ?? {}) as Record<string, unknown>;

    return {
      homeName: typeof home.name === "string" ? home.name : "Home",
      awayName: typeof away.name === "string" ? away.name : "Away",
      fullHome: toNum(fulltime.home) ?? toNum(goals.home),
      fullAway: toNum(fulltime.away) ?? toNum(goals.away),
      halfHome: toNum(halftime.home),
      halfAway: toNum(halftime.away),
      statusShort:
        typeof status.short === "string"
          ? status.short
          : typeof event.fixture_status_short === "string"
            ? event.fixture_status_short
            : "",
    };
  } catch {
    return null;
  }
}

export function SportOutcomeBlock({ event }: { event: SportEvent | undefined }) {
  const s = extractSportScore(event);
  if (!s) return null;
  const finalKnown = s.fullHome !== null && s.fullAway !== null;
  const halfKnown = s.halfHome !== null && s.halfAway !== null;

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="flex-1 text-right text-sm font-medium truncate">
          {s.homeName}
        </span>
        <span className="text-2xl font-mono tabular-nums text-foreground">
          {finalKnown ? s.fullHome : "—"}
          <span className="mx-2 text-foreground-muted">:</span>
          {finalKnown ? s.fullAway : "—"}
        </span>
        <span className="flex-1 text-left text-sm font-medium truncate">
          {s.awayName}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-foreground-muted px-2 py-0.5 rounded-full border border-border">
          {s.statusShort || "—"}
        </span>
      </div>
      {halfKnown ? (
        <div className="mt-1.5 text-center text-[11px] text-foreground-muted">
          Halftime{" "}
          <span className="font-mono tabular-nums">
            {s.halfHome} : {s.halfAway}
          </span>
        </div>
      ) : null}
      {!finalKnown ? (
        <div className="mt-1.5 text-center text-[11px] text-foreground-muted">
          Match not finished
        </div>
      ) : null}
    </div>
  );
}

export function inlineSportOutcome(event: SportEvent | undefined): string | undefined {
  const s = extractSportScore(event);
  if (!s) return undefined;
  if (s.fullHome !== null && s.fullAway !== null) {
    return `${s.homeName} ${s.fullHome}-${s.fullAway} ${s.awayName} (${s.statusShort || "FT"})`;
  }
  if (s.halfHome !== null && s.halfAway !== null) {
    return `${s.homeName} ${s.halfHome}-${s.halfAway} ${s.awayName} (HT)`;
  }
  return `${s.homeName} vs ${s.awayName} (${s.statusShort || "NS"})`;
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

type CryptoOutcome = {
  open: number | null;
  close: number | null;
  outcome: "up" | "down" | null;
};

export function extractCryptoOutcome(
  event: CryptoEvent | undefined,
): CryptoOutcome | null {
  if (!event) return null;
  const open = parseDecimal(event.price_to_beat);
  const close = parseDecimal(event.price_at_close);
  const decisionOutcome = event.decision?.outcome ?? null;
  // If we have absolutely nothing useful, skip.
  if (open === null && close === null && decisionOutcome === null) return null;
  return { open, close, outcome: decisionOutcome };
}

export function CryptoOutcomeBlock({ event }: { event: CryptoEvent | undefined }) {
  const o = extractCryptoOutcome(event);
  if (!o) return null;
  const haveBoth = o.open !== null && o.close !== null;
  const pct =
    haveBoth && o.open !== 0 ? ((o.close! - o.open!) / o.open!) * 100 : null;
  const arrowTone =
    o.outcome === "up"
      ? "text-success"
      : o.outcome === "down"
        ? "text-danger"
        : "text-foreground-muted";
  const arrowGlyph =
    o.outcome === "up" ? "▲" : o.outcome === "down" ? "▼" : "—";
  const verdictLabel =
    o.outcome === "up" ? "UP" : o.outcome === "down" ? "DOWN" : "PENDING";

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Open
          </span>
          <span className="text-base font-mono tabular-nums">
            {formatPrice(o.open)}
          </span>
        </div>
        <span className="text-foreground-muted">→</span>
        <div className="flex flex-col items-start flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Close
          </span>
          <span className="text-base font-mono tabular-nums">
            {formatPrice(o.close)}
          </span>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 ${arrowTone}`}>
          <span className="text-lg">{arrowGlyph}</span>
          <span className="text-sm font-semibold">{verdictLabel}</span>
        </span>
      </div>
      {pct !== null ? (
        <div className="mt-1.5 text-center text-[11px] text-foreground-muted">
          <span className={pct >= 0 ? "text-success" : "text-danger"}>
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </span>
        </div>
      ) : !haveBoth ? (
        <div className="mt-1.5 text-center text-[11px] text-foreground-muted">
          Awaiting close price
        </div>
      ) : null}
    </div>
  );
}

export function inlineCryptoOutcome(
  event: CryptoEvent | undefined,
): string | undefined {
  const o = extractCryptoOutcome(event);
  if (!o) return undefined;
  const arrow = o.outcome === "up" ? "▲" : o.outcome === "down" ? "▼" : "—";
  const verdict =
    o.outcome === "up" ? "UP" : o.outcome === "down" ? "DOWN" : "pending";
  const open = formatPrice(o.open);
  const close = o.close !== null ? formatPrice(o.close) : "…";
  return `${open} → ${close} ${arrow} ${verdict}`;
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseDecimal(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1000) {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (n >= 1) {
    return `$${n.toFixed(2)}`;
  }
  return `$${n.toPrecision(4)}`;
}
```

- [ ] **Step 2: Type-check and lint**

Run:
```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/event-outcome.tsx
git commit -m "feat: add SportOutcomeBlock and CryptoOutcomeBlock components"
```

---

## Task 4: `/markets` list — thread lifecycle + result through row builders

**Files:**
- Modify: `app/markets/page.tsx`

Goal: each row carries a `lifecycle` and `result`. Crypto/sport loaders pass the parent event into the row builder; manual loader uses plan-only derivation.

- [ ] **Step 1: Replace `Row` shape and row builders + update render**

Edit `app/markets/page.tsx`:

1. Replace the imports block (lines 1-22) by adding three imports:

```tsx
import { derive, type Lifecycle, type Result } from "@/lib/market-lifecycle";
import { LifecycleStepper, ResultChip } from "@/components/market-lifecycle";
```

(keep the existing imports intact; just add these alongside).

2. Replace the `Row` type (lines 50-62) with:

```tsx
type Row = {
  question: string;
  source: PlanSource;
  marketExternalId?: string | null;
  lifecycle: Lifecycle;
  result: Result;
  // Deep-link context.
  planExternalId?: string;
  position?: number;
  sportMarketId?: number;
  cryptoEventId?: number;
  // Sort key (epoch ms).
  sortKey: number;
};
```

3. Replace `rowFromManual` with:

```tsx
function rowFromManual(
  m: DeployPlanMarket,
  plan: DeployPlan,
  source: PlanSource,
): Row {
  const { lifecycle, result } = derive({
    source: "manual",
    planMarket: m,
  });
  return {
    question: m.question,
    source,
    marketExternalId: m.external_id,
    lifecycle,
    result,
    planExternalId: plan.external_id,
    position: m.position,
    sortKey: new Date(m.updated_at).getTime(),
  };
}
```

4. Replace `rowFromCrypto` with:

```tsx
function rowFromCrypto(m: CryptoMarket, ev: CryptoEvent): Row {
  const { lifecycle, result } = derive({
    source: "crypto",
    cryptoMarket: m,
    cryptoEvent: ev,
  });
  return {
    question: m.market_slug,
    source: "crypto",
    marketExternalId: m.market_external_id,
    lifecycle,
    result,
    planExternalId: m.deploy_plan_external_id,
    position: m.deploy_plan_position,
    cryptoEventId: ev.id,
    sortKey: new Date(ev.slot_end ?? ev.slot_start ?? m.updated_at).getTime(),
  };
}
```

5. Replace `rowFromSport` with:

```tsx
function rowFromSport(m: SportMarket, ev: SportEvent): Row {
  const { lifecycle, result } = derive({
    source: "sport",
    sportMarket: m,
    sportEvent: ev,
  });
  return {
    question: m.market_slug,
    source: "sport",
    marketExternalId: m.market_external_id,
    lifecycle,
    result,
    planExternalId: m.deploy_plan_external_id,
    position: m.deploy_plan_position,
    sportMarketId: m.id,
    sortKey: new Date(ev.kickoff_at ?? m.updated_at).getTime(),
  };
}
```

6. Update the `statusFilter` logic (lines 108-110) — old code reads `r.statuses`. Replace with current-stage matching:

```tsx
const filtered = statusFilter
  ? rows.filter((r) =>
      r.lifecycle.stages.some(
        (s) => s.key.toLowerCase() === statusFilter.toLowerCase() && s.status === "active",
      ) ||
      r.result.label.toLowerCase() === statusFilter.toLowerCase(),
    )
  : rows;
```

7. Update the status filter input placeholder text (line 134):

```tsx
placeholder="e.g. created, proposed, resolved, won, lost"
```

8. Replace the `RowItem` component (lines 177-219) with:

```tsx
function RowItem({ row }: { row: Row }) {
  const params = new URLSearchParams();
  params.set("source", row.source);
  if (row.planExternalId) params.set("plan_id", row.planExternalId);
  if (row.position !== undefined) params.set("pos", String(row.position));
  if (row.sportMarketId !== undefined)
    params.set("sport_market_id", String(row.sportMarketId));
  if (row.cryptoEventId !== undefined)
    params.set("crypto_event_id", String(row.cryptoEventId));
  const href = row.marketExternalId
    ? `/markets/${encodeURIComponent(row.marketExternalId)}?${params.toString()}`
    : null;

  return (
    <li>
      <div className="rounded-lg border border-border bg-surface px-4 py-3 flex items-center gap-3 flex-wrap hover:border-foreground/30 transition-colors">
        <Badge tone={sourceTone(row.source)}>{row.source}</Badge>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {row.question || (
            <span className="text-foreground-muted italic">(untitled)</span>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <LifecycleStepper lifecycle={row.lifecycle} variant="compact" />
          <ResultChip result={row.result} />
        </div>
        {href ? (
          <Link
            href={href}
            className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-foreground/[0.04] hover:border-foreground/40 transition-colors shrink-0"
          >
            Open →
          </Link>
        ) : (
          <span className="text-xs text-foreground-muted italic px-2">
            not deployed yet
          </span>
        )}
      </div>
    </li>
  );
}
```

9. Remove the now-unused `tonalize` helper from this file (lines 353-360) — `LifecycleStepper` / `ResultChip` carry their own tones. Keep `sourceTone` and the local `type Tone` (still used for `sourceTone`).

10. Remove the `statuses` references in `Row` from any other usage — search for `.statuses` in this file and remove related code paths. The unused `Tab` import stays only if it's still used (it is — for `buildSourceTabs`).

- [ ] **Step 2: Type-check and lint**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean. If unused-import warnings remain, prune them.

- [ ] **Step 3: Visual check**

Start the dev server (if not already running) and visit `http://localhost:3000/markets`. Verify:

- Each row shows: source badge → question → 3-dot stepper → result chip (Won / Lost / Pending / Refund, absent for manual) → Open button.
- The "All", "Manual", "Crypto", "Sport" tabs still work.
- Status filter with "won" / "lost" / "created" filters correctly.

If the page errors, check the browser console for the actual error and fix.

- [ ] **Step 4: Commit**

```bash
git add app/markets/page.tsx
git commit -m "feat(markets): show lifecycle stepper and result chip per row"
```

---

## Task 5: `/markets/[external_id]` detail — replace StatusStrip with LifecycleHeader

**Files:**
- Modify: `app/markets/[external_id]/page.tsx`

Goal: remove the 6-cell StatusStrip, replace with a single LifecycleHeader (stepper + result + factual outcome block when applicable). Add `crypto_event_id` search param. For sport, hop `sport_market_id` → `getMarketStatus` → `getEvent` to load the full SportEvent (with decisions and fixture_payload).

- [ ] **Step 1: Add imports**

Edit `app/markets/[external_id]/page.tsx` and add these imports next to the existing ones (top of file):

```tsx
import { derive } from "@/lib/market-lifecycle";
import { LifecycleStepper, ResultChip } from "@/components/market-lifecycle";
import { SportOutcomeBlock, CryptoOutcomeBlock } from "@/components/event-outcome";
import { crypto as cryptoApi } from "@/lib/api";
import type { CryptoEvent, SportEvent, SportMarket } from "@/lib/types";
```

Note: the file already imports `manual` and `sports` from `@/lib/api`. Renaming the new import to `cryptoApi` avoids shadowing the JS `crypto` global.

- [ ] **Step 2: Extend SearchParams + page-level data loads**

Replace the `SearchParams` type (lines 26-31) with:

```tsx
type SearchParams = {
  source?: string;
  plan_id?: string;
  pos?: string;
  sport_market_id?: string;
  crypto_event_id?: string;
};
```

Inside `MarketDetailPage`, replace the parameter parsing block (lines 47-53) with:

```tsx
const sourceHint = parseSource(sp.source);
const planId = sp.plan_id;
const pos = sp.pos !== undefined ? Number.parseInt(sp.pos, 10) : undefined;
const sportMarketId =
  sp.sport_market_id !== undefined
    ? Number.parseInt(sp.sport_market_id, 10)
    : undefined;
const cryptoEventId =
  sp.crypto_event_id !== undefined
    ? Number.parseInt(sp.crypto_event_id, 10)
    : undefined;
```

Replace the local `sportLocalStatus` variable block (lines 58-83) with the richer loader:

```tsx
let sportEvent: SportEvent | undefined;
let sportMarket: SportMarket | undefined;
let cryptoEvent: CryptoEvent | undefined;
let cryptoMarketRecord: import("@/lib/types").CryptoMarket | undefined;

try {
  verdict = await manual.getMarketStatus(external_id);
} catch (err) {
  fetchError = err instanceof Error ? err.message : String(err);
}

if (planId && pos !== undefined && Number.isFinite(pos)) {
  try {
    plan = await manual.getDeployPlan(planId);
    planMarket = plan.markets.find((m) => m.position === pos);
  } catch {
    // Soft-fail.
  }
}

if (sourceHint === "sport" && sportMarketId !== undefined) {
  try {
    const statusRaw = await sports.getMarketStatus(sportMarketId);
    const eventId = extractParentEventId(statusRaw);
    if (eventId !== undefined) {
      sportEvent = await sports.getEvent(eventId);
      sportMarket = sportEvent.markets?.find((m) => m.id === sportMarketId);
    }
  } catch {
    // Soft-fail.
  }
}

if (sourceHint === "crypto" && cryptoEventId !== undefined) {
  try {
    cryptoEvent = await cryptoApi.getCryptoEvent(cryptoEventId);
    cryptoMarketRecord = cryptoEvent.markets?.find(
      (m) => m.market_external_id === external_id,
    );
  } catch {
    // Soft-fail.
  }
}
```

Remove the now-unused `sportLocalStatus` and `extractSportLocalStatus` helper (lines 547-569). Update the `MarketActionsPanel` usage (lines 196-205) so any `sportLocalStatus` prop instead gets `sportMarket?.local_status`:

```tsx
<MarketActionsPanel
  source={source}
  dpmMarket={m ?? undefined}
  verdictStatus={verdict?.status}
  planMarket={planMarket}
  planExternalId={plan?.external_id}
  sportMarketId={sportMarketId}
  sportLocalStatus={sportMarket?.local_status}
  marketExternalId={external_id}
/>
```

- [ ] **Step 3: Add the new helper at the bottom of the file**

Append this before the closing of the file (after `tonalize`):

```tsx
function extractParentEventId(raw: Record<string, unknown> | null): number | undefined {
  if (!raw) return undefined;
  // Accept either {market:{sport_event_id:...}} or {sport_event_id:...}
  const direct = (raw as { sport_event_id?: unknown }).sport_event_id;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const nested = (raw as { market?: { sport_event_id?: unknown } }).market
    ?.sport_event_id;
  if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  return undefined;
}
```

(If the backoffice handler uses a different field name — e.g. `event_id` — this helper degrades to "no event" rather than crashing. Real field name verification happens at visual-check time.)

- [ ] **Step 4: Replace StatusStrip with LifecycleHeader**

Find `StatusStrip` usage (lines 101-107) and replace with:

```tsx
<LifecycleHeader
  source={source}
  verdict={verdict}
  planMarket={planMarket}
  sportMarket={sportMarket}
  sportEvent={sportEvent}
  cryptoMarket={cryptoMarketRecord}
  cryptoEvent={cryptoEvent}
/>
```

Delete the entire `StatusStrip` function (lines 261-321) and the now-unused `tonalize` (lines 538-545) and `sourceTone` (lines 534-536) helpers in this file — they were StatusStrip-only.

Add this new component just below the `MarketDetailPage` export (alongside `Breadcrumbs`):

```tsx
function LifecycleHeader({
  source,
  verdict,
  planMarket,
  sportMarket,
  sportEvent,
  cryptoMarket,
  cryptoEvent,
}: {
  source: PlanSource;
  verdict: MarketStatusVerdict | null;
  planMarket?: DeployPlanMarket;
  sportMarket?: SportMarket;
  sportEvent?: SportEvent;
  cryptoMarket?: import("@/lib/types").CryptoMarket;
  cryptoEvent?: CryptoEvent;
}) {
  const derived =
    source === "sport" && sportMarket
      ? derive({ source: "sport", sportMarket, sportEvent })
      : source === "crypto" && cryptoMarket
        ? derive({ source: "crypto", cryptoMarket, cryptoEvent })
        : derive({
            source: "manual",
            planMarket,
            verdict: verdict ?? undefined,
          });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
              Source
            </span>
            <Badge tone={source === "sport" ? "info" : source === "crypto" ? "warning" : "neutral"}>
              {source}
            </Badge>
          </div>
          <ResultChip result={derived.result} showReason />
        </div>
        <div className="mt-4">
          <LifecycleStepper lifecycle={derived.lifecycle} variant="full" />
        </div>
      </div>

      {source === "sport" && sportEvent ? (
        <SportOutcomeBlock event={sportEvent} />
      ) : null}
      {source === "crypto" && cryptoEvent ? (
        <CryptoOutcomeBlock event={cryptoEvent} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Type-check and lint**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean. Most likely errors: missing import for `SportMarket`/`CryptoEvent` types — they were added in Step 1 but verify.

- [ ] **Step 6: Visual check**

Visit a known sport market detail (open it from `/markets?source=sport`). Verify:

- Lifecycle stepper visible at top with all three stages.
- Result chip shows ✓ Won / ✗ Lost (or pending if not resolved) with a `title` tooltip explaining why.
- Below the stepper: a SportOutcomeBlock showing team names + score (or "Match not finished" if NS).

Then open a crypto market (from `/markets?source=crypto`). Verify the CryptoOutcomeBlock renders (open→close prices + ▲/▼ verdict).

Then open a manual market — stepper shows, no result chip, no outcome block.

If the parent SportEvent doesn't load (verify in the browser by checking that team names appear), the `extractParentEventId` field name guess is wrong. Open `app/api/...` or use the Network tab to inspect the actual JSON from `GET /sports/markets/:id/status` and update the helper to match.

- [ ] **Step 7: Commit**

```bash
git add app/markets/[external_id]/page.tsx
git commit -m "feat(market-detail): replace StatusStrip with LifecycleHeader and outcome block"
```

---

## Task 6: `/events/[external_id]` per-market card — stepper + result

**Files:**
- Modify: `app/events/[external_id]/page.tsx`

Goal: in `MarketCard`, replace the 4-badge chip line (`plan: / verdict: / deploy: / uma:`) with a `LifecycleStepper` + `ResultChip`. The full raw values stay in the expandable `Details` `<details>`.

- [ ] **Step 1: Add imports**

Add to the top imports of `app/events/[external_id]/page.tsx`:

```tsx
import { derive } from "@/lib/market-lifecycle";
import { LifecycleStepper, ResultChip } from "@/components/market-lifecycle";
```

- [ ] **Step 2: Replace the chip line inside `MarketCard`**

Inside `MarketCard` (lines ~412-441), find the block:

```tsx
<div className="flex flex-wrap items-center gap-1.5">
  <Badge tone={tonalize(m.status)}>plan: {m.status}</Badge>
  {verdict?.status ? (
    <Badge tone={tonalize(verdict.status)}>verdict: {verdict.status}</Badge>
  ) : null}
  {dpm?.deployment_status ? (
    <Badge tone={tonalize(dpm.deployment_status)}>
      deploy: {dpm.deployment_status}
    </Badge>
  ) : null}
  {dpm?.uma_resolution_status ? (
    <Badge tone={tonalize(dpm.uma_resolution_status)}>
      uma: {dpm.uma_resolution_status}
    </Badge>
  ) : null}
  {m.parent_market_id ? (
    <Badge tone="neutral">recreated</Badge>
  ) : null}
</div>
```

Replace it with:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <LifecycleStepper
    lifecycle={derive({
      source: "manual",
      planMarket: m,
      verdict: verdict ?? undefined,
    }).lifecycle}
    variant="compact"
  />
  <ResultChip
    result={derive({
      source: "manual",
      planMarket: m,
      verdict: verdict ?? undefined,
    }).result}
  />
  {m.parent_market_id ? (
    <Badge tone="neutral">recreated</Badge>
  ) : null}
</div>
```

(The `MarketCard` here is driven by manual DeployPlan data — even for events that originated from crypto/sport automation, the per-market card in this page only has plan+verdict context. That's correct: sport/crypto-specific lifecycle requires loading the SportEvent or CryptoEvent for this dpm event_external_id, which Task 7 introduces. For now, the lifecycle here uses the manual derivation regardless of source — it's still useful and accurate for the manual side of the pipeline.)

- [ ] **Step 3: Verify `tonalize` still has uses in this file**

Search the file for remaining `tonalize(` calls. There should still be uses for `EventStatusStrip` (deployment / source aggregate). If `tonalize` becomes unused, delete the function. Otherwise keep it.

- [ ] **Step 4: Type-check and lint**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean. If you see "Badge is unused" — check that Badge is still used for the "recreated" tag plus the EventStatusStrip / EventDetailsCard. It is.

- [ ] **Step 5: Visual check**

Visit any event detail page. Each market card should now show stepper + result chip + (optional) `recreated` badge. The expandable "Details" still has the raw external_id / condition_id / workflow_status / etc.

- [ ] **Step 6: Commit**

```bash
git add app/events/[external_id]/page.tsx
git commit -m "feat(event-detail): replace per-market status chips with lifecycle stepper"
```

---

## Task 7: `/events/[external_id]` — page-level factual outcome block

**Files:**
- Modify: `app/events/[external_id]/page.tsx`

Goal: above the markets section, render a `SportOutcomeBlock` or `CryptoOutcomeBlock` for sport/crypto-sourced events. Implementation: a request-scoped `findParentSportOrCryptoEvent` that scans up to N tasks looking for the matching `event_external_id`.

- [ ] **Step 1: Add imports + scanner helper**

Top of file, alongside earlier imports:

```tsx
import { sports, crypto as cryptoApi } from "@/lib/api";
import { SportOutcomeBlock, CryptoOutcomeBlock } from "@/components/event-outcome";
import type { CryptoEvent, SportEvent } from "@/lib/types";
```

(`manual` is already imported. If you have a duplicate `crypto` import, prefer aliasing the new one as `cryptoApi`.)

At the bottom of the file (before `tonalize` or after it — anywhere in the helpers area), add:

```tsx
const TASK_SCAN_LIMIT = 10;

async function findParentSportEvent(
  externalId: string,
): Promise<SportEvent | undefined> {
  let tasks;
  try {
    tasks = await sports.listTasks();
  } catch {
    return undefined;
  }
  for (const t of tasks.slice(0, TASK_SCAN_LIMIT)) {
    try {
      const events = await sports.listEvents(t.id);
      const found = events.find((ev) => ev.event_external_id === externalId);
      if (found) {
        try {
          return await sports.getEvent(found.id);
        } catch {
          return found;
        }
      }
    } catch {
      // skip task
    }
  }
  return undefined;
}

async function findParentCryptoEvent(
  externalId: string,
): Promise<CryptoEvent | undefined> {
  let tasks;
  try {
    tasks = await cryptoApi.listTasks();
  } catch {
    return undefined;
  }
  for (const t of tasks.slice(0, TASK_SCAN_LIMIT)) {
    try {
      const events = await cryptoApi.listCryptoEvents(t.id);
      const found = events.find((ev) => ev.event_external_id === externalId);
      if (found) {
        try {
          return await cryptoApi.getCryptoEvent(found.id);
        } catch {
          return found;
        }
      }
    } catch {
      // skip task
    }
  }
  return undefined;
}
```

- [ ] **Step 2: Fetch the parent event after source detection**

Inside `EventDetailPage`, right after `const source: PlanSource = ...` (line ~55), add:

```tsx
let parentSportEvent: SportEvent | undefined;
let parentCryptoEvent: CryptoEvent | undefined;
if (source === "sport") {
  parentSportEvent = await findParentSportEvent(external_id);
} else if (source === "crypto") {
  parentCryptoEvent = await findParentCryptoEvent(external_id);
}
```

- [ ] **Step 3: Render the outcome block**

Inside the JSX, just after `<EventStatusStrip .../>` (line ~91), add:

```tsx
{parentSportEvent ? <SportOutcomeBlock event={parentSportEvent} /> : null}
{parentCryptoEvent ? <CryptoOutcomeBlock event={parentCryptoEvent} /> : null}
```

- [ ] **Step 4: Type-check and lint**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean.

- [ ] **Step 5: Visual check**

Open an event that came from a sport task (find one via `/events?source=sport`). Verify the SportOutcomeBlock renders above the markets section with team names + score.

Open a crypto-sourced event — verify the CryptoOutcomeBlock renders.

Open a manual event — neither block renders, no errors.

If the scan is noticeably slow (e.g. >2s on cold load), consider lowering `TASK_SCAN_LIMIT` to 5. Don't worry about it on initial implementation — page-level dynamic = ok.

- [ ] **Step 6: Commit**

```bash
git add app/events/[external_id]/page.tsx
git commit -m "feat(event-detail): add factual outcome block for sport and crypto events"
```

---

## Task 8: `/events` list — inline outcome string on crypto/sport rows

**Files:**
- Modify: `app/events/page.tsx`

Goal: when the crypto/sport loaders already have the parent event in hand, append a one-liner outcome to the `subtitle` field.

- [ ] **Step 1: Add imports + use the inline helpers**

Top of `app/events/page.tsx`:

```tsx
import { inlineSportOutcome, inlineCryptoOutcome } from "@/components/event-outcome";
```

In `cryptoRows`, where each `row` is built (around line 418), update `subtitle`:

```tsx
const outcomeLine = inlineCryptoOutcome(ev);
const row: Row = {
  eventExternalId: ev.event_external_id,
  title: ev.event_slug || `crypto_event#${ev.id}`,
  source: "crypto",
  marketCount: ev.markets?.length ?? 0,
  flags: {},
  subtitle: outcomeLine
    ? `${outcomeLine} · ${ev.slot_start} → ${ev.slot_end}`
    : `${ev.slot_start} → ${ev.slot_end}`,
  sortKey: new Date(ev.slot_end ?? ev.created_at).getTime(),
};
```

In `sportRows`, similarly (around line 453):

```tsx
const outcomeLine = inlineSportOutcome(ev);
const row: Row = {
  eventExternalId: ev.event_external_id,
  title: ev.event_slug || `sport_event#${ev.id}`,
  source: "sport",
  marketCount: ev.markets?.length ?? 0,
  flags: {},
  subtitle: outcomeLine
    ? `${outcomeLine} · kickoff ${ev.kickoff_at} · ${ev.fixture_status_short}`
    : `kickoff ${ev.kickoff_at} · ${ev.fixture_status_short}`,
  sortKey: new Date(ev.kickoff_at).getTime(),
};
```

- [ ] **Step 2: Type-check and lint**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean.

- [ ] **Step 3: Visual check**

Visit `/events?source=sport`. Each sport row's subtitle now starts with e.g. `Arsenal 2-1 Chelsea (FT) · kickoff …`.

Visit `/events?source=crypto`. Each row's subtitle starts with `$67,000 → $67,500 ▲ UP · …`.

- [ ] **Step 4: Commit**

```bash
git add app/events/page.tsx
git commit -m "feat(events): show inline outcome line on sport and crypto rows"
```

---

## Task 9: Thread `crypto_event_id` through upstream links

**Files:**
- Modify: `app/events/[external_id]/page.tsx`

Goal: when the per-market card on `/events/[external_id]` builds its `Open →` link to `/markets/[external_id]`, include `crypto_event_id` if we have the parent CryptoEvent. Without this, opening a crypto market from the event page won't render the crypto outcome block.

- [ ] **Step 1: Thread the crypto event into MarketCard's href**

In `app/events/[external_id]/page.tsx`, find the `MarketCard` component's `href` construction (around line 405):

```tsx
const href = m.external_id
  ? `/markets/${encodeURIComponent(m.external_id)}?source=${source}&plan_id=${encodeURIComponent(row.planExternalId)}&pos=${row.position}`
  : null;
```

Pass `parentCryptoEvent` into `MarketCard` so we can append the param when present. Update the `MarketCard` invocation (line ~128):

```tsx
<MarketCard
  key={`${row.planExternalId}-${row.position}`}
  row={row}
  source={source}
  verdict={row.market.external_id ? verdicts.get(row.market.external_id) : undefined}
  cryptoEventId={parentCryptoEvent?.id}
/>
```

Update the `MarketCard` signature (line ~395):

```tsx
function MarketCard({
  row,
  source,
  verdict,
  cryptoEventId,
}: {
  row: MarketRow;
  source: PlanSource;
  verdict?: MarketStatusVerdict;
  cryptoEventId?: number;
}) {
```

And the href construction:

```tsx
const params = new URLSearchParams({
  source,
  plan_id: row.planExternalId,
  pos: String(row.position),
});
if (cryptoEventId !== undefined) params.set("crypto_event_id", String(cryptoEventId));
const href = m.external_id
  ? `/markets/${encodeURIComponent(m.external_id)}?${params.toString()}`
  : null;
```

(For sport, the `sport_market_id` deep-link param doesn't come through `MarketCard` because the event-detail page only has manual DeployPlan data — there's no SportMarket.id available here without additional scanning. That's an acceptable limitation: opening a sport market from this page still shows the per-market lifecycle from `verdict + plan`; the SportOutcomeBlock will be missing. The richer view is reachable via `/automations/sports/...` or `/markets?source=sport`. Don't add a sport scan here — it would balloon the page load.)

- [ ] **Step 2: Type-check and lint**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint
```
Expected: clean.

- [ ] **Step 3: Visual check**

Open a crypto-sourced event page. Click "Open →" on any market card. The market detail page should render the CryptoOutcomeBlock at the top.

- [ ] **Step 4: Commit**

```bash
git add app/events/[external_id]/page.tsx
git commit -m "feat(event-detail): thread crypto_event_id into market deep links"
```

---

## Task 10: Cross-page UX sweep

- [ ] **Step 1: Run a full quality check**

```bash
cd /home/yuvala/Documents/prediction-claude/prediction-backoffice
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all three pass. `next build` flushes any cache that would mask a runtime regression.

- [ ] **Step 2: Walk the user journey in the browser**

With the dev server running, click through:

1. `/markets` — All tab: rows show source + question + stepper + result chip. Filter by `won`, `lost`, `created` — each narrows the list correctly.
2. `/markets?source=sport` — sport-specific rows. Click into a resolved sport market — header shows lifecycle done across all 3 stages + ✓ Won (or ✗ Lost) chip + SportOutcomeBlock with the right score.
3. `/markets?source=crypto` — same drill for a resolved crypto market. Header should show UP/DOWN arrow + open/close prices.
4. `/events?source=sport` — subtitle of each row contains the score (or "vs … (NS)" for not-started).
5. `/events/[some-sport-event]` — SportOutcomeBlock at top; each market card shows the compact stepper + chip.
6. `/events/[some-crypto-event]` — CryptoOutcomeBlock at top; click into a market — its detail page now has the crypto outcome block too (proves the `crypto_event_id` link threading works).

Take note of any visual misalignments, missing tones, overflow on narrow viewports. Resize the browser to ~360px wide and re-check.

- [ ] **Step 3: Address sweep findings**

If anything looks off, make a focused commit:

```bash
git add <files>
git commit -m "fix: <one-line UX adjustment>"
```

Keep these commits surgical — no scope creep.

- [ ] **Step 4: Final commit + summary message**

If everything passes cleanly, you're done. Summarize the diff:

```bash
git log --oneline main..HEAD
git diff --stat main
```

---

## Self-Review

**Spec coverage:**
- LifecycleStepper + ResultChip → Task 2 ✓
- SportOutcomeBlock + CryptoOutcomeBlock + inline strings → Task 3 ✓
- Per-source derivation rules (sport / crypto / manual) → Task 1 ✓
- `/markets` row card change → Task 4 ✓
- `/markets/[external_id]` StatusStrip replacement → Task 5 ✓
- New `crypto_event_id` search param + sport hop via `getMarketStatus` → Task 5 ✓
- `/events/[external_id]` per-market card → Task 6 ✓
- `/events/[external_id]` factual outcome block → Task 7 ✓
- `/events` list inline outcome → Task 8 ✓
- Upstream link threading for `crypto_event_id` → Task 9 ✓
- Manual markets emit no result chip → Task 1 (returns `kind: "na"`) + Task 2 (early-return when `kind === "na"`) ✓
- Fallback when fixture_payload malformed → Task 3 (try/catch returns null) ✓
- Fallback when crypto slug doesn't end -up/-down → Task 1 (returns pending with reason) ✓

**Placeholder scan:** None. All code blocks contain full content; commands are exact; no "TBD".

**Type consistency:**
- `LifecycleStageStatus` ("pending"|"active"|"done"|"failed"|"skipped") — defined once in Task 1, consumed by Task 2 ✓
- `Result.kind` enum — same ✓
- `derive` dispatcher — Task 1 signature matches all call sites in Task 4 / 5 / 6 ✓
- `findSportDecisionFor` uses `sport_market_type_id` — matches `SportDecision` definition in `lib/types.ts:573` ✓
