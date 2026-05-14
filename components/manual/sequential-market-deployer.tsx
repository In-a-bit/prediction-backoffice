"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  buttonVariants,
} from "@/components/ui";
import { newUUID } from "@/lib/manual/helpers";
import type {
  ManualAudit,
  MarketAccepted,
  MarketPayload,
  MarketStatus,
  MarketStatusVerdict,
} from "@/lib/types";

import {
  MarketEditor,
  emptyMarketEditorState,
  marketEditorStateFromPayload,
  marketEditorStateToPayload,
  type MarketEditorState,
} from "./market-editor";

// One row in the deployer queue. Each market starts as `idle`, gets submitted,
// then progresses through the polled lifecycle below.
export type DeployRowStatus =
  | "idle"
  | "submitting"
  | MarketStatus // running, deployed, failed, waiting_for_balance, deploying, pending
  | "skipped";

export type DeployRow = {
  // Stable per-row identity that survives reorder/edit. Generated when the row
  // is first added to the queue.
  rowId: string;
  // The editor state the operator sees / edits.
  editor: MarketEditorState;
  // Populated after the 202 envelope comes back from /manual/markets/create.
  externalId?: string;
  workflowId?: string;
  // Latest server verdict for this row.
  status: DeployRowStatus;
  error?: string;
  pendingActivity?: string;
  // Timestamp of the last status verdict (ms since epoch).
  lastChecked?: number;
};

type DeployerState = {
  rows: DeployRow[];
  // Index of the row currently in flight; -1 when paused / done.
  activeIndex: number;
  // Operator-controlled toggle. The loop pauses between rows when false.
  running: boolean;
  // Stable correlation_id for the audit log — generated once per page load.
  correlationId: string;
};

type Action =
  | { type: "init"; rows: DeployRow[]; correlationId: string }
  | { type: "add" }
  | { type: "remove"; rowId: string }
  | { type: "edit"; rowId: string; editor: MarketEditorState }
  | { type: "start"; index: number }
  | { type: "pause" }
  | { type: "resume" }
  | {
      type: "submitted";
      rowId: string;
      externalId: string;
      workflowId: string;
    }
  | { type: "verdict"; rowId: string; verdict: MarketStatusVerdict }
  | { type: "fail"; rowId: string; error: string }
  | { type: "skip"; rowId: string }
  | { type: "advance" }
  | { type: "recreate"; rowId: string; freshId: string };

function reducer(state: DeployerState, action: Action): DeployerState {
  switch (action.type) {
    case "init":
      return {
        ...state,
        rows: action.rows,
        correlationId: action.correlationId,
      };
    case "add": {
      const row: DeployRow = {
        rowId: newUUID(),
        editor: emptyMarketEditorState(),
        status: "idle",
      };
      return { ...state, rows: [...state.rows, row] };
    }
    case "remove":
      return {
        ...state,
        rows: state.rows.filter((r) => r.rowId !== action.rowId),
      };
    case "edit":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.rowId === action.rowId ? { ...r, editor: action.editor } : r,
        ),
      };
    case "start":
      return { ...state, activeIndex: action.index, running: true };
    case "pause":
      return { ...state, running: false };
    case "resume":
      return { ...state, running: true };
    case "submitted":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.rowId === action.rowId
            ? {
                ...r,
                externalId: action.externalId,
                workflowId: action.workflowId,
                status: "running",
              }
            : r,
        ),
      };
    case "verdict":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.rowId === action.rowId
            ? {
                ...r,
                status: action.verdict.status,
                error: action.verdict.error,
                pendingActivity:
                  action.verdict.pending_activity?.activity_type,
                lastChecked: Date.now(),
              }
            : r,
        ),
      };
    case "fail":
      return {
        ...state,
        running: false,
        rows: state.rows.map((r) =>
          r.rowId === action.rowId
            ? { ...r, status: "failed", error: action.error }
            : r,
        ),
      };
    case "skip":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.rowId === action.rowId ? { ...r, status: "skipped" } : r,
        ),
      };
    case "advance":
      return { ...state, activeIndex: state.activeIndex + 1 };
    case "recreate":
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.rowId === action.rowId
            ? {
                ...r,
                rowId: action.freshId,
                externalId: undefined,
                workflowId: undefined,
                status: "idle",
                error: undefined,
                pendingActivity: undefined,
                lastChecked: undefined,
              }
            : r,
        ),
      };
  }
}

export type SequentialMarketDeployerProps = {
  // The event these markets attach to. Either external_id (uuid string) or
  // numeric id is acceptable — at least one must be set.
  eventExternalId?: string;
  eventId?: number;
  // Optional initial market drafts (e.g. from the slug or AI-from-description
  // flow). If provided, the queue is pre-populated instead of starting empty.
  initialMarkets?: MarketPayload[];
  // SessionStorage key — the queue rehydrates if a row exists for this key on
  // mount, so the operator can refresh mid-deploy without losing progress.
  storageKey: string;
  // Audit override — typically the actor name. Correlation id is generated
  // internally and stamped on every submitted row.
  audit?: Omit<ManualAudit, "correlation_id">;
  // Called when every row has reached a terminal state (deployed / skipped /
  // failed). The slug + description-as-series flows use this to advance to
  // their next phase.
  onAllSettled?: (rows: DeployRow[]) => void;
};

const POLL_INTERVAL_MS = 1000;

const STORAGE_VERSION = 1;

type Persisted = {
  v: number;
  rows: DeployRow[];
  correlationId: string;
  activeIndex: number;
};

function loadPersisted(key: string): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Persisted;
    if (data.v !== STORAGE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

function persist(key: string, state: DeployerState) {
  if (typeof window === "undefined") return;
  const payload: Persisted = {
    v: STORAGE_VERSION,
    rows: state.rows,
    correlationId: state.correlationId,
    activeIndex: state.activeIndex,
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled — ignore. Persistence is best-effort.
  }
}

export function SequentialMarketDeployer({
  eventExternalId,
  eventId,
  initialMarkets,
  storageKey,
  audit,
  onAllSettled,
}: SequentialMarketDeployerProps) {
  const [state, dispatch] = useReducer(reducer, undefined as never, () => {
    const persisted = loadPersisted(storageKey);
    if (persisted) {
      return {
        rows: persisted.rows,
        activeIndex: persisted.activeIndex,
        running: false, // resume always requires a manual click
        correlationId: persisted.correlationId,
      } satisfies DeployerState;
    }
    const initialRows: DeployRow[] =
      initialMarkets?.map((m) => ({
        rowId: newUUID(),
        editor: marketEditorStateFromPayload(m),
        status: "idle",
      })) ?? [];
    return {
      rows: initialRows,
      activeIndex: -1,
      running: false,
      correlationId: newUUID(),
    } satisfies DeployerState;
  });

  // Persist on every change so a refresh can pick up exactly where we left off.
  useEffect(() => {
    persist(storageKey, state);
  }, [state, storageKey]);

  // Hold non-identity-stable props in refs so the driver effect can read the
  // latest values WITHOUT taking a dependency on their reference. The parent
  // typically passes a fresh `audit={{}}` object and an inline `onAllSettled`
  // arrow every render — naively depending on those would tear down in-flight
  // polls/submits every parent re-render.
  const auditRef = useRef(audit);
  const onAllSettledRef = useRef(onAllSettled);
  useEffect(() => {
    auditRef.current = audit;
    onAllSettledRef.current = onAllSettled;
  });

  // Stable callback for the polling loop. Reads audit + correlationId from
  // refs / lazy state so its identity is fixed for the lifetime of the
  // component (correlationId is generated once in the lazy initializer).
  const correlationId = state.correlationId;
  const submitMarket = useCallback(
    async (row: DeployRow) => {
      const payload = marketEditorStateToPayload(row.editor, {
        event_id: eventId,
        event_external_id: eventExternalId,
      });
      const res = await fetch("/api/manual/markets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...auditRef.current,
          correlation_id: correlationId,
          payload,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`create market: ${res.status}: ${text}`);
      }
      return (await res.json()) as MarketAccepted;
    },
    [eventExternalId, eventId, correlationId],
  );

  // The driver loop runs ONCE per (activeIndex, running) pair. When the row
  // is fresh it submits and starts polling; when the row was previously
  // submitted (e.g. after refresh) it just resumes polling. The polling loop
  // is self-perpetuating via setTimeout — it does NOT rely on the effect
  // re-running on every verdict, otherwise verdict-driven row updates would
  // tear down and restart polling in a tight loop with no 1s spacing.
  //
  // We intentionally read state.rows / onAllSettled via a ref instead of
  // depending on them so the effect is not torn down when:
  //   - a verdict updates a row's status (rows array gets a new identity)
  //   - the parent re-renders and passes a fresh inline onAllSettled
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const { activeIndex, running } = state;
  // Capture the row identity (rowId + externalId) at effect setup so the
  // effect's body can detect the active row precisely, even if rows array
  // identities churn beneath us. We re-read these via stateRef inside async
  // callbacks to get the latest fields.
  const row =
    activeIndex >= 0 && activeIndex < state.rows.length
      ? state.rows[activeIndex]
      : null;
  const rowKey = row ? `${row.rowId}:${row.externalId ?? "?"}` : "";

  useEffect(() => {
    if (!running) return;
    const snapshot = stateRef.current;
    if (
      snapshot.activeIndex < 0 ||
      snapshot.activeIndex >= snapshot.rows.length
    ) {
      onAllSettledRef.current?.(snapshot.rows);
      return;
    }
    const activeRow = snapshot.rows[snapshot.activeIndex];
    if (!activeRow) return;

    // Skip rows already in a terminal state — happens after rehydration when
    // the operator pressed Resume.
    if (activeRow.status === "deployed" || activeRow.status === "skipped") {
      dispatch({ type: "advance" });
      return;
    }
    if (
      activeRow.status === "failed" ||
      activeRow.status === "waiting_for_balance"
    ) {
      // Halt — the operator must click Recreate, Skip, or Signal balance.
      dispatch({ type: "pause" });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (externalId: string) => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/manual/markets/${encodeURIComponent(externalId)}/status`,
        );
        if (cancelled) return;
        if (!res.ok) {
          timer = setTimeout(() => poll(externalId), POLL_INTERVAL_MS);
          return;
        }
        const verdict = (await res.json()) as MarketStatusVerdict;
        if (cancelled) return;
        dispatch({ type: "verdict", rowId: activeRow.rowId, verdict });

        if (verdict.status === "deployed") {
          dispatch({ type: "advance" });
          return;
        }
        if (
          verdict.status === "failed" ||
          verdict.status === "waiting_for_balance"
        ) {
          dispatch({ type: "pause" });
          return;
        }
        // running / deploying / pending → keep polling on the 1s cadence.
        timer = setTimeout(() => poll(externalId), POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        // Transient network errors should not halt the queue — retry shortly.
        timer = setTimeout(() => poll(externalId), POLL_INTERVAL_MS);
      }
    };

    if (!activeRow.externalId) {
      // Fresh row — submit it then start polling once we have the external_id.
      (async () => {
        try {
          const accepted = await submitMarket(activeRow);
          if (cancelled) return;
          dispatch({
            type: "submitted",
            rowId: activeRow.rowId,
            externalId: accepted.external_id,
            workflowId: accepted.workflow_id,
          });
          poll(accepted.external_id);
        } catch (err) {
          if (cancelled) return;
          dispatch({
            type: "fail",
            rowId: activeRow.rowId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    } else {
      // Already submitted (e.g. after refresh) — resume polling its status.
      poll(activeRow.externalId);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Intentionally minimal deps: rerun only when the active row identity
    // changes, the running flag flips, or the submit callback's stable
    // dependencies (event link, correlation id) change. rows-array churn
    // from verdict updates does not trigger a re-run.
  }, [activeIndex, running, rowKey, submitMarket]);

  // ------ Operator actions ------

  const start = () => {
    if (state.rows.length === 0) return;
    const firstUnfinished = state.rows.findIndex(
      (r) => r.status !== "deployed" && r.status !== "skipped",
    );
    if (firstUnfinished === -1) {
      onAllSettled?.(state.rows);
      return;
    }
    dispatch({ type: "start", index: firstUnfinished });
  };

  const recreate = (rowId: string) => {
    dispatch({ type: "recreate", rowId, freshId: newUUID() });
    // Resume from the recreated row.
    const idx = state.rows.findIndex((r) => r.rowId === rowId);
    if (idx >= 0) dispatch({ type: "start", index: idx });
  };

  const skip = (rowId: string) => {
    dispatch({ type: "skip", rowId });
    const idx = state.rows.findIndex((r) => r.rowId === rowId);
    if (idx === state.activeIndex) {
      dispatch({ type: "advance" });
      dispatch({ type: "resume" });
    }
  };

  const signalBalance = async (workflowId: string, rowId: string) => {
    try {
      const res = await fetch("/api/manual/markets/signal-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`signal: ${res.status}: ${text}`);
      }
      // The workflow now resumes; flip the row back to running and let the
      // poll loop pick it up.
      const rowIdx = state.rows.findIndex((r) => r.rowId === rowId);
      if (rowIdx >= 0) dispatch({ type: "start", index: rowIdx });
    } catch (err) {
      console.error("signalBalance failed", err);
    }
  };

  // ------ Render ------

  const allSettled =
    state.rows.length > 0 &&
    state.rows.every(
      (r) => r.status === "deployed" || r.status === "skipped",
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Markets queue</h2>
              <p className="text-xs text-foreground-muted mt-0.5">
                Markets deploy one at a time. The next one waits for the
                previous to reach <span className="font-mono">DEPLOYED</span>.
                You can pause, recreate a failed market, or skip and continue.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => dispatch({ type: "add" })}
                className={buttonVariants.secondary}
              >
                + Add market
              </button>
              {state.running ? (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "pause" })}
                  className={buttonVariants.secondary}
                >
                  Pause
                </button>
              ) : allSettled ? null : (
                <button
                  type="button"
                  onClick={start}
                  disabled={state.rows.length === 0}
                  className={buttonVariants.primary}
                >
                  {state.activeIndex >= 0 ? "Resume" : "Deploy queue"}
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {state.rows.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No markets in the queue yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {state.rows.map((row, index) => (
                <li
                  key={row.rowId}
                  className="rounded-lg border border-border bg-foreground/[0.02]"
                >
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-foreground-muted font-mono">
                        #{index + 1}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {row.editor.question || (
                          <span className="text-foreground-muted italic">
                            (untitled market)
                          </span>
                        )}
                      </span>
                      <StatusBadge status={row.status} />
                      {row.pendingActivity ? (
                        <span className="text-[11px] text-foreground-muted">
                          · {row.pendingActivity}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {row.status === "failed" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => recreate(row.rowId)}
                            className={buttonVariants.secondary}
                          >
                            Recreate
                          </button>
                          <button
                            type="button"
                            onClick={() => skip(row.rowId)}
                            className={buttonVariants.ghost}
                          >
                            Skip
                          </button>
                        </>
                      ) : null}
                      {row.status === "waiting_for_balance" && row.workflowId ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              signalBalance(row.workflowId!, row.rowId)
                            }
                            className={buttonVariants.primary}
                          >
                            Signal balance added
                          </button>
                          <button
                            type="button"
                            onClick={() => skip(row.rowId)}
                            className={buttonVariants.ghost}
                          >
                            Skip
                          </button>
                        </>
                      ) : null}
                      {row.status === "idle" ? (
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: "remove", rowId: row.rowId })
                          }
                          className={buttonVariants.ghost}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {row.error ? (
                    <div className="px-4 py-2">
                      <ErrorMessage>{row.error}</ErrorMessage>
                    </div>
                  ) : null}

                  {row.externalId ? (
                    <div className="px-4 py-2 text-[11px] text-foreground-muted font-mono break-all">
                      external_id: {row.externalId}
                      {row.workflowId ? (
                        <>
                          {" · "}
                          workflow: {row.workflowId}
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Editor visible while idle so the operator can iterate
                      before kicking off the queue. Once submitted it becomes
                      a read-only summary so values can't drift away from what
                      was actually sent. */}
                  {row.status === "idle" ? (
                    <div className="px-4 py-3 border-t border-border">
                      <MarketEditor
                        idPrefix={`market-${row.rowId}`}
                        value={row.editor}
                        onChange={(next) =>
                          dispatch({
                            type: "edit",
                            rowId: row.rowId,
                            editor: next,
                          })
                        }
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-[11px] text-foreground-muted">
        correlation_id:{" "}
        <span className="font-mono">{state.correlationId}</span>
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DeployRowStatus }) {
  switch (status) {
    case "idle":
      return <Badge tone="neutral">draft</Badge>;
    case "submitting":
      return <Badge tone="info">submitting…</Badge>;
    case "running":
    case "deploying":
    case "pending":
      return <Badge tone="info">{status}</Badge>;
    case "waiting_for_balance":
      return <Badge tone="warning">waiting for balance</Badge>;
    case "deployed":
      return <Badge tone="success">deployed</Badge>;
    case "failed":
      return <Badge tone="danger">failed</Badge>;
    case "skipped":
      return <Badge tone="neutral">skipped</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}
