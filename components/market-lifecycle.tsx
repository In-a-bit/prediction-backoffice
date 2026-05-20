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
