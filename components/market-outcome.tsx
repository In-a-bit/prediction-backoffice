// Renders the propose + per-token resolution outcome returned by
// dpm-api's GET /markets/by-external-id/:id/outcome. Two variants:
//   <MarketOutcomeCard>   — full card for the market detail page
//   <MarketOutcomeInline> — single-line summary for event-market cards and the /markets list row

import type { MarketOutcome, ProposedAnswer, TokenOutcome } from "@/lib/types";

// 18-decimal fixed-point: 1e18 = YES, 0 = NO, 0.5e18 = 50/50. Mirrors the
// constants in lib/market-lifecycle.ts so we render the same values consistently.
const WEI_YES = "1000000000000000000";
const WEI_NO = "0";
const WEI_5050 = "500000000000000000";

type ResolvedLabel = {
  // Human-readable token label, e.g. "YES", "NO", "UP", "50/50".
  label: string;
  // Raw wei value (set in title attr for the operator who needs it).
  raw: string;
};

// resolveProposedLabel maps the server label + token list to a display label.
// The server tells us *which side* was proposed (first/second/tie); we look
// up the actual outcome label from the tokens so we say "UP" instead of
// "first outcome" for crypto markets.
function resolveProposedLabel(
  proposed: ProposedAnswer,
  tokens: TokenOutcome[],
): ResolvedLabel {
  switch (proposed.label) {
    case "first_outcome_yes":
      return { label: tokens[0]?.outcome ?? "YES", raw: proposed.proposed_price };
    case "second_outcome_yes":
      return { label: tokens[1]?.outcome ?? "NO", raw: proposed.proposed_price };
    case "fifty_fifty":
      return { label: "50/50", raw: proposed.proposed_price };
    default:
      return { label: proposed.proposed_price, raw: proposed.proposed_price };
  }
}

function tokenWinnerChip(t: TokenOutcome) {
  if (t.winner === null || t.winner === undefined) {
    return { glyph: "·", label: "pending", classes: "bg-foreground/5 text-foreground-muted border-foreground/15" };
  }
  if (t.winner) {
    return { glyph: "✓", label: "Won", classes: "bg-success/15 text-success border-success/40" };
  }
  return { glyph: "·", label: "Lost", classes: "bg-foreground/5 text-foreground-muted border-foreground/15" };
}

// MarketOutcomeCard — full card for the market detail page. Renders a
// "Propose & resolution" section listing the proposed answer (UMA only),
// then a row per token outcome with its win/lose chip.
export function MarketOutcomeCard({ outcome }: { outcome: MarketOutcome | null }) {
  if (!outcome) return null;
  const { proposed, tokens, resolution_type } = outcome;
  const proposedDisplay = proposed ? resolveProposedLabel(proposed, tokens) : null;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          Propose &amp; resolution
        </h2>
      </div>
      <div className="px-5 py-4 space-y-4">
        {proposedDisplay ? (
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted w-20 shrink-0">
              Proposed
            </span>
            <span
              title={`raw=${proposedDisplay.raw}`}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-info/15 text-info border-info/40"
            >
              {proposedDisplay.label}
            </span>
            <span className="text-[11px] font-mono text-foreground-muted truncate">
              {formatWei(proposedDisplay.raw)}
            </span>
          </div>
        ) : resolution_type === "CTF_ORACLE" ? (
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted w-20 shrink-0">
              Proposed
            </span>
            <span className="text-xs text-foreground-muted italic">
              n/a — CTF Oracle markets report payouts directly
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted w-20 shrink-0">
              Proposed
            </span>
            <span className="text-xs text-foreground-muted italic">
              Not proposed yet
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Resolved
          </div>
          {tokens.length === 0 ? (
            <div className="text-xs text-foreground-muted italic">
              No tokens recorded yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {tokens.map((t, i) => {
                const chip = tokenWinnerChip(t);
                return (
                  <li key={`${t.outcome}-${i}`} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-foreground w-20 shrink-0">
                      {t.outcome}
                    </span>
                    <span
                      title={`winner=${t.winner === null || t.winner === undefined ? "null" : t.winner}`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${chip.classes}`}
                    >
                      <span aria-hidden="true">{chip.glyph}</span>
                      <span>{chip.label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="text-[11px] text-foreground-muted">
          Resolution type:{" "}
          <span className="font-mono">{resolution_type}</span>
        </div>
      </div>
    </div>
  );
}

// MarketOutcomeInline — compact one-liner for /markets rows and event-detail
// market cards. Renders nothing when we have no information at all.
export function MarketOutcomeInline({ outcome }: { outcome: MarketOutcome | null }) {
  if (!outcome) return null;
  const { proposed, tokens, resolution_type } = outcome;
  const winner = tokens.find((t) => t.winner === true);
  const proposedDisplay = proposed ? resolveProposedLabel(proposed, tokens) : null;
  const anyResolved = tokens.some((t) => t.winner !== null && t.winner !== undefined);

  // If we know absolutely nothing useful (no propose, no resolution), suppress.
  if (!proposedDisplay && !anyResolved) return null;

  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-foreground-muted">
      {proposedDisplay ? (
        <span className="inline-flex items-center gap-1">
          <span className="uppercase tracking-wider text-[10px]">Proposed</span>
          <span
            title={`raw=${proposedDisplay.raw}`}
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-info/15 text-info border-info/40"
          >
            {proposedDisplay.label}
          </span>
        </span>
      ) : resolution_type === "CTF_ORACLE" ? null : null}
      {(proposedDisplay || anyResolved) ? (
        <span aria-hidden="true">·</span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <span className="uppercase tracking-wider text-[10px]">Resolved</span>
        {anyResolved ? (
          winner ? (
            <span
              title={`winner=${winner.outcome}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-success/15 text-success border-success/40"
            >
              <span aria-hidden="true">✓</span>
              <span>{winner.outcome}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-warning/15 text-warning border-warning/40">
              <span aria-hidden="true">↺</span>
              <span>Refund</span>
            </span>
          )
        ) : (
          <span className="text-foreground-muted italic">awaiting</span>
        )}
      </span>
    </div>
  );
}

// Compact wei → human display. Returns "1.0", "0.5", "0", or the raw value
// when it doesn't match a known constant. The full raw value is always in
// the title attribute for verification.
function formatWei(wei: string): string {
  if (wei === WEI_YES) return "1.0";
  if (wei === WEI_NO) return "0";
  if (wei === WEI_5050) return "0.5";
  return wei;
}
