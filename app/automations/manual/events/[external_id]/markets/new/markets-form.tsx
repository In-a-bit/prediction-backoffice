"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  buttonVariants,
} from "@/components/ui";
import { DeployPlanDriver } from "@/components/manual/deploy-plan-driver";
import {
  MarketEditor,
  emptyMarketEditorState,
  marketEditorStateToPayload,
  type MarketEditorState,
} from "@/components/manual/market-editor";
import { newUUID } from "@/lib/manual/helpers";
import type { DeployPlan } from "@/lib/types";

// MarketsForm now creates a backend-persisted DeployPlan when the operator
// clicks Create plan. After that, all state lives in Postgres and the
// DeployPlanDriver is a thin observer over /deploy-plans/:id.
export function MarketsForm({
  eventExternalId,
  eventId,
}: {
  eventExternalId: string;
  eventId?: number;
}) {
  const storageKey = `manual-markets-plan:${eventExternalId}`;
  const [planId, setPlanId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<MarketEditorState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // On mount: rehydrate the active plan id from sessionStorage so a refresh
  // jumps straight to the observer view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(storageKey);
    if (saved) setPlanId(saved);
  }, [storageKey]);

  const addRow = () => setDrafts((prev) => [...prev, emptyMarketEditorState()]);
  const removeRow = (i: number) =>
    setDrafts((prev) => prev.filter((_, j) => j !== i));
  const updateRow = (i: number, next: MarketEditorState) =>
    setDrafts((prev) => {
      const arr = [...prev];
      arr[i] = next;
      return arr;
    });

  const createPlan = () => {
    setError(null);
    if (drafts.length === 0) {
      setError("Add at least one market before creating the plan.");
      return;
    }
    if (drafts.some((d) => !d.question.trim())) {
      setError("Every market needs a question.");
      return;
    }
    startTransition(async () => {
      try {
        const markets = drafts.map((d) =>
          marketEditorStateToPayload(d, {
            event_id: eventId,
            event_external_id: eventExternalId,
          }),
        );
        const res = await fetch("/api/manual/deploy-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correlation_id: newUUID(),
            event_external_id: eventExternalId,
            event_id: eventId,
            note: `Manual markets for event ${eventExternalId}`,
            markets,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        const plan = (await res.json()) as DeployPlan;
        window.sessionStorage.setItem(storageKey, plan.external_id);
        setPlanId(plan.external_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const startNewPlan = () => {
    window.sessionStorage.removeItem(storageKey);
    setPlanId(null);
    setDrafts([]);
  };

  if (planId) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-foreground-muted">
          Plan persisted to the backend.{" "}
          <Link
            href={`/automations/manual/plans/${encodeURIComponent(planId)}`}
            className="underline"
          >
            Open plan page →
          </Link>{" "}
          Closing this tab does not stop execution.
        </p>
        <DeployPlanDriver planExternalId={planId} />
        <button
          type="button"
          onClick={startNewPlan}
          className={buttonVariants.ghost}
        >
          Start a new plan for this event
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Markets queue</h2>
            <button
              type="button"
              onClick={addRow}
              className={buttonVariants.secondary}
            >
              + Add market
            </button>
          </div>
        </CardHeader>
        <CardBody>
          {drafts.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No markets yet — add one to get started.
            </p>
          ) : (
            <ul className="space-y-3">
              {drafts.map((d, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border bg-foreground/[0.02]"
                >
                  <details>
                    <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2">
                      <span className="text-sm flex items-center gap-2 min-w-0">
                        <span className="text-xs text-foreground-muted font-mono shrink-0">
                          #{i + 1}
                        </span>
                        <span className="truncate">
                          {d.question || (
                            <span className="italic text-foreground-muted">
                              (no question)
                            </span>
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          removeRow(i);
                        }}
                        className="text-xs text-danger hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    </summary>
                    <div className="px-3 py-3 border-t border-border">
                      <MarketEditor
                        idPrefix={`new-market-${i}`}
                        value={d}
                        onChange={(next) => updateRow(i, next)}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={createPlan}
          disabled={pending || drafts.length === 0}
          className={buttonVariants.primary}
        >
          {pending ? "Creating plan…" : "Create deploy plan"}
        </button>
      </div>
      <p className="text-xs text-foreground-muted">
        After you create the plan, click <em>Deploy queue</em> on the next
        screen to start backend execution. The plan persists across UI/server
        restarts.
      </p>
    </div>
  );
}
