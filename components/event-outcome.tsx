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
