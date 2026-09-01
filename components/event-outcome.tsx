// Factual outcome block — shows the real-world fact a market resolves
// against. Sport: team names + final/partial score. Crypto: open→close
// price + direction.

import type { CryptoEvent, SportEvent } from "@/lib/types";
import { formatDateTimeFull } from "@/lib/format";
import { parseContestFor } from "@/lib/sports/registry";
import type { SportContest } from "@/lib/sports/types";

// ---------------------------------------------------------------------------
// Sport
// ---------------------------------------------------------------------------

// extractSportScore projects the stored payload through the parser belonging
// to the event's own sport. Vendors disagree on shape — soccer nests the
// match under `fixture` and splits scores into `goals`/`score.fulltime`,
// hockey is flat — so the sport key decides, not the payload.
export function extractSportScore(event: SportEvent | undefined): SportContest | null {
  if (!event?.fixture_payload) return null;
  const contest = parseContestFor(event.sport_key, event.fixture_payload);
  if (!contest) return null;
  return {
    ...contest,
    statusShort: contest.statusShort || event.fixture_status_short || "",
  };
}

export function SportOutcomeBlock({ event }: { event: SportEvent | undefined }) {
  const s = extractSportScore(event);
  if (!s) return null;
  const finalKnown = s.scoreHome !== null && s.scoreAway !== null;
  const partialKnown = s.partialHome != null && s.partialAway != null;

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-2">
      {event?.kickoff_at ? (
        <div className="text-center text-[11px] text-foreground-muted">
          <span className="uppercase tracking-wider">Start</span>{" "}
          <span className="font-mono">{formatDateTimeFull(event.kickoff_at)}</span>
        </div>
      ) : null}
      <div className="flex items-center gap-4">
        <span className="flex-1 text-right text-sm font-medium truncate">
          {s.homeName}
        </span>
        <span className="text-2xl font-mono tabular-nums text-foreground">
          {finalKnown ? s.scoreHome : "—"}
          <span className="mx-2 text-foreground-muted" aria-hidden="true">:</span>
          {finalKnown ? s.scoreAway : "—"}
        </span>
        <span className="flex-1 text-left text-sm font-medium truncate">
          {s.awayName}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-foreground-muted px-2 py-0.5 rounded-full border border-border">
          {s.statusShort || "—"}
        </span>
      </div>
      {partialKnown ? (
        <div className="mt-1.5 text-center text-[11px] text-foreground-muted">
          {s.partialLabel}{" "}
          <span className="font-mono tabular-nums">
            {s.partialHome} : {s.partialAway}
          </span>
        </div>
      ) : null}
      {!finalKnown ? (
        <div className="mt-1.5 text-center text-[11px] text-foreground-muted">
          Not finished
        </div>
      ) : null}
    </div>
  );
}

export function inlineSportOutcome(event: SportEvent | undefined): string | undefined {
  const s = extractSportScore(event);
  if (!s) return undefined;
  if (s.scoreHome !== null && s.scoreAway !== null) {
    return `${s.homeName} ${s.scoreHome}-${s.scoreAway} ${s.awayName} (${s.statusShort || "FT"})`;
  }
  if (s.partialHome != null && s.partialAway != null) {
    return `${s.homeName} ${s.partialHome}-${s.partialAway} ${s.awayName} (${s.partialLabel})`;
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
  const open = o.open;
  const close = o.close;
  const haveBoth = open !== null && close !== null;
  const pct =
    haveBoth && open !== 0 ? ((close - open) / open) * 100 : null;
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
        <span className="text-foreground-muted" aria-hidden="true">→</span>
        <div className="flex flex-col items-start flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Close
          </span>
          <span className="text-base font-mono tabular-nums">
            {formatPrice(o.close)}
          </span>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 ${arrowTone}`}>
          <span className="text-lg" aria-hidden="true">{arrowGlyph}</span>
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

function parseDecimal(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(n: number | null): string {
  if (n === null) return "—";
  // Pinned locale prevents SSR/CSR hydration mismatches from differing comma/decimal conventions.
  if (n >= 1000) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (n >= 1) {
    return `$${n.toFixed(2)}`;
  }
  return `$${n.toPrecision(4)}`;
}
