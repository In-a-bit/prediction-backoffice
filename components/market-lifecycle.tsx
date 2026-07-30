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
  disputed: "Disputed",
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

// A disputed round completes with status "done" (the dispute landed on chain),
// but it's a red flag the operator should see — so its dot and connector render
// in the danger tone regardless of the "done" progress state.
function dotClass(s: LifecycleStage): string {
  if (s.key === "disputed") return DOT_TONE.failed;
  return DOT_TONE[s.status];
}

function lineClass(s: LifecycleStage): string {
  if (s.key === "disputed") return LINE_TONE.failed;
  return LINE_TONE[s.status];
}

const RESULT_STYLE: Record<
  Exclude<Result["kind"], "na">,
  { glyph: string; classes: string }
> = {
  won:     { glyph: "✓", classes: "bg-success/15 text-success border-success/40" },
  lost:    { glyph: "✗", classes: "bg-danger/15 text-danger border-danger/40" },
  refund:  { glyph: "↺", classes: "bg-warning/15 text-warning border-warning/40" },
  pending: { glyph: "—", classes: "bg-foreground/5 text-foreground-muted border-foreground/15" },
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
        className="inline-flex items-center"
        role="img"
        aria-label={a11yLabel(stages)}
      >
        {stages.map((s, i) => (
          <span key={`${s.key}-${i}`} className="inline-flex items-center">
            <span className={`block w-2 h-2 rounded-full ${dotClass(s)}`} />
            {i < stages.length - 1 ? (
              <span className={`block w-3 h-0.5 ${lineClass(s)}`} />
            ) : null}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-start w-full" role="img" aria-label={a11yLabel(stages)}>
      {stages.map((s, i) => (
        <div key={`${s.key}-${i}`} className="flex items-start flex-1 last:flex-initial">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <span
              className={`block w-3.5 h-3.5 rounded-full ${dotClass(s)}`}
            />
            <div className="text-center">
              <div className="text-[11px] font-medium text-foreground leading-tight">
                {STAGE_LABELS[s.key]}
              </div>
              <div className="text-[10px] text-foreground-muted leading-tight">
                {s.status}
              </div>
              {s.origin === "external" ? (
                <div className="text-[9px] font-medium text-warning leading-tight">
                  external
                </div>
              ) : null}
              {s.detail ? (
                <div className="text-[9px] text-foreground-muted leading-tight">
                  {s.detail}
                </div>
              ) : null}
            </div>
          </div>
          {i < stages.length - 1 ? (
            // mt-[7px] centers the 2px line against the 14px (h-3.5) dot above it
            <span
              className={`mt-[7px] h-0.5 flex-1 mx-2 ${lineClass(s)}`}
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

  const m = RESULT_STYLE[result.kind];
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
