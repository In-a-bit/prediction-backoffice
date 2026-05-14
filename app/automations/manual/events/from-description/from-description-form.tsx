"use client";

import { useState, useTransition } from "react";

import {
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  Field,
  InfoMessage,
  buttonVariants,
  inputClass,
} from "@/components/ui";
import {
  EventEditor,
  emptyEventEditorState,
  eventEditorStateFromPayload,
  eventEditorStateToPayload,
  type EventEditorState,
} from "@/components/manual/event-editor";
import {
  MarketEditor,
  marketEditorStateFromPayload,
  marketEditorStateToPayload,
  type MarketEditorState,
} from "@/components/manual/market-editor";
import {
  SeriesEditor,
  emptySeriesEditorState,
  seriesEditorStateFromPayload,
  seriesEditorStateToPayload,
  type SeriesEditorState,
} from "@/components/manual/series-editor";
import { DeployPlanDriver } from "@/components/manual/deploy-plan-driver";
import { marketDraftToPayload, newUUID } from "@/lib/manual/helpers";
import type {
  AiDraftMode,
  SeriesOfEventsDraft,
  SingleEventDraft,
} from "@/lib/manual/ai-schemas";
import type {
  DeployPlan,
  EventResponse,
  ManualAudit,
  MarketPayload,
  SeriesResponse,
  TagResponse,
} from "@/lib/types";

type DraftEnvelope =
  | { mode: "single-event"; data: SingleEventDraft }
  | { mode: "series-of-events"; data: SeriesOfEventsDraft };

type Phase =
  | "input"
  | "review"
  | "creating"
  | "deploying-markets"
  | "done";

type EventDraftRow = {
  state: EventEditorState;
  // Markets are kept as editor state during review so the operator can edit
  // them before approving. They're converted back to MarketPayload[] when
  // the deploy plan for this event is created.
  markets: MarketEditorState[];
  // Populated as the chain creates each event row.
  created?: EventResponse;
  // The backend deploy plan (external_id) for this event's markets, set after
  // the event is created and the plan is POSTed. The DeployPlanDriver below
  // observes this plan_id.
  planExternalId?: string;
};

export function FromDescriptionForm() {
  const [mode, setMode] = useState<AiDraftMode>("single-event");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Drafts after AI generation.
  const [seriesState, setSeriesState] = useState<SeriesEditorState | null>(
    null,
  );
  const [eventRows, setEventRows] = useState<EventDraftRow[]>([]);
  const [tagDrafts, setTagDrafts] = useState<{ slug: string; label: string }[]>(
    [],
  );

  // Created results.
  const [createdSeries, setCreatedSeries] = useState<SeriesResponse | null>(
    null,
  );
  // Index of the event currently being deployed (events created sequentially,
  // each followed by its full market deploy queue).
  const [activeEventIndex, setActiveEventIndex] = useState<number>(-1);
  const [correlationId] = useState<string>(() => newUUID());

  const audit: ManualAudit = { correlation_id: correlationId };

  const generate = () => {
    setError(null);
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/manual/ai-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, description }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        const env = (await res.json()) as DraftEnvelope;
        const draftMarketsToEditor = (markets: SingleEventDraft["markets"]) =>
          markets
            .map(marketDraftToPayload)
            .map((p) => marketEditorStateFromPayload(p as MarketPayload));
        if (env.mode === "single-event") {
          setSeriesState(null);
          setEventRows([
            {
              state: eventEditorStateFromPayload(env.data.event),
              markets: draftMarketsToEditor(env.data.markets),
            },
          ]);
          setTagDrafts(env.data.tags);
        } else {
          setSeriesState(seriesEditorStateFromPayload(env.data.series));
          setEventRows(
            env.data.events.map((e) => ({
              state: eventEditorStateFromPayload(e.event),
              markets: draftMarketsToEditor(e.markets),
            })),
          );
          setTagDrafts(env.data.tags);
        }
        setPhase("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const upsertTags = async (): Promise<number[]> => {
    const ids: number[] = [];
    for (const t of tagDrafts) {
      try {
        const res = await fetch("/api/manual/tags/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: t.slug, label: t.label }),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as TagResponse;
        ids.push(data.id);
      } catch {
        // Best-effort.
      }
    }
    return ids;
  };

  const startChain = () => {
    setError(null);
    startTransition(async () => {
      try {
        // Series first if present.
        let seriesExternalId: string | undefined;
        if (seriesState) {
          const res = await fetch("/api/manual/series/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...audit,
              payload: seriesEditorStateToPayload(seriesState),
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(`series: ${body.error ?? res.status}`);
          }
          const data = (await res.json()) as SeriesResponse;
          setCreatedSeries(data);
          seriesExternalId = data.external_id;
        }

        const tagIds = await upsertTags();

        // Each event is created right before its markets deploy. We seed the
        // first event here; subsequent events are created via deployNextEvent
        // in the SequentialMarketDeployer's onAllSettled callback below.
        await createEventAt(0, seriesExternalId, tagIds);
        setPhase("deploying-markets");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("review");
      }
    });
  };

  const createEventAt = async (
    index: number,
    seriesExternalId: string | undefined,
    tagIds: number[],
  ) => {
    const row = eventRows[index];
    const eventPayload = eventEditorStateToPayload(row.state);
    if (seriesExternalId) eventPayload.series_external_id = seriesExternalId;
    if (tagIds.length) eventPayload.tag_ids = tagIds;
    const res = await fetch("/api/manual/events/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...audit, payload: eventPayload }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(`event #${index + 1}: ${body.error ?? res.status}`);
    }
    const event = (await res.json()) as EventResponse;

    // Create the per-event deploy plan in the backend so the operator can
    // start it (or watch it) without the UI driving execution.
    const planRes = await fetch("/api/manual/deploy-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...audit,
        event_external_id: event.external_id,
        event_id: event.id,
        note: `From AI description (event ${index + 1} of ${eventRows.length})`,
        markets: row.markets.map((m) =>
          marketEditorStateToPayload(m, {
            event_id: event.id,
            event_external_id: event.external_id,
          }),
        ),
      }),
    });
    if (!planRes.ok) {
      const body = (await planRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(`plan #${index + 1}: ${body.error ?? planRes.status}`);
    }
    const plan = (await planRes.json()) as DeployPlan;

    setEventRows((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        created: event,
        planExternalId: plan.external_id,
      };
      return next;
    });
    setActiveEventIndex(index);
  };

  const advanceToNextEvent = async () => {
    const next = activeEventIndex + 1;
    if (next >= eventRows.length) {
      setPhase("done");
      return;
    }
    try {
      // Reuse the seriesExternalId already set on the events. tagIds are stamped
      // once on the first event's create — subsequent events can read them off
      // the first event's payload if needed; for simplicity we don't re-attach
      // tags to subsequent events in the series (they inherit via the series).
      await createEventAt(
        next,
        createdSeries?.external_id,
        eventRows[next].state.tag_ids ?? [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("review");
    }
  };

  if (phase === "input") {
    return (
      <Card>
        <CardBody className="space-y-4">
          <Field label="Mode" htmlFor="mode">
            <select
              id="mode"
              className={inputClass}
              value={mode}
              onChange={(e) => setMode(e.target.value as AiDraftMode)}
            >
              <option value="single-event">
                Single event (one event with markets)
              </option>
              <option value="series-of-events">
                Series of events (one series, multiple events with markets each)
              </option>
            </select>
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            hint="Plain prose. Be specific about thresholds, dates, recurrence — the AI uses these to generate field values."
          >
            <textarea
              id="description"
              className={inputClass}
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 'A weekly Bitcoin close-above-100k market for the next 8 weeks starting 2027-01-04. One event per week, one market per event.'"
            />
          </Field>

          {error ? <ErrorMessage>{error}</ErrorMessage> : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className={buttonVariants.primary}
            >
              {pending ? "Drafting…" : "Draft with Gemini"}
            </button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <InfoMessage>
        Mode: <strong>{mode}</strong> · correlation_id:{" "}
        <span className="font-mono">{correlationId}</span>
      </InfoMessage>

      {seriesState ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Series</h2>
          </CardHeader>
          <CardBody>
            {createdSeries ? (
              <p className="text-sm">
                ✓ Created — external_id{" "}
                <code className="font-mono">{createdSeries.external_id}</code>
              </p>
            ) : (
              <SeriesEditor
                value={seriesState}
                onChange={setSeriesState}
                idPrefix="desc-series"
              />
            )}
          </CardBody>
        </Card>
      ) : null}

      {eventRows.map((row, idx) => {
        const isActive = idx === activeEventIndex;
        const isCreated = Boolean(row.created);
        return (
          <Card key={idx}>
            <CardHeader>
              <h2 className="font-semibold">
                Event {idx + 1} of {eventRows.length}{" "}
                <span className="text-xs text-foreground-muted font-normal">
                  · {row.state.title || "(untitled)"}
                </span>
              </h2>
            </CardHeader>
            <CardBody className="space-y-3">
              {isCreated ? (
                <p className="text-sm">
                  ✓ Created — external_id{" "}
                  <code className="font-mono">{row.created!.external_id}</code>
                </p>
              ) : phase === "review" ? (
                <>
                  <EventEditor
                    value={row.state}
                    onChange={(next) =>
                      setEventRows((prev) => {
                        const arr = [...prev];
                        arr[idx] = { ...arr[idx], state: next };
                        return arr;
                      })
                    }
                    idPrefix={`desc-event-${idx}`}
                  />
                  <MarketsReview
                    markets={row.markets}
                    idPrefix={`desc-event-${idx}`}
                    onChange={(nextMarkets) =>
                      setEventRows((prev) => {
                        const arr = [...prev];
                        arr[idx] = { ...arr[idx], markets: nextMarkets };
                        return arr;
                      })
                    }
                  />
                </>
              ) : (
                <p className="text-sm text-foreground-muted">
                  Waiting for previous event to finish deploying.
                </p>
              )}

              {isCreated && isActive && row.planExternalId ? (
                <DeployPlanDriver
                  planExternalId={row.planExternalId}
                  onCompleted={() => {
                    void advanceToNextEvent();
                  }}
                />
              ) : null}

              {!isActive && !isCreated && phase !== "review" ? (
                <p className="text-xs text-foreground-muted">
                  {row.markets.length} market(s) queued for after creation.
                </p>
              ) : null}
            </CardBody>
          </Card>
        );
      })}

      {phase === "review" ? (
        <>
          {tagDrafts.length ? (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Tags</h2>
              </CardHeader>
              <CardBody className="text-sm flex flex-wrap gap-1.5">
                {tagDrafts.map((t) => (
                  <span
                    key={t.slug}
                    className="inline-flex items-center gap-1 rounded-full bg-foreground/5 border border-border px-2 py-0.5 text-xs"
                  >
                    {t.label}{" "}
                    <span className="text-foreground-muted">({t.slug})</span>
                  </span>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhase("input")}
              className={buttonVariants.ghost}
            >
              Start over
            </button>
            <button
              type="button"
              onClick={startChain}
              disabled={pending || eventRows.length === 0}
              className={buttonVariants.primary}
            >
              {pending ? "Creating…" : "Create everything"}
            </button>
          </div>
        </>
      ) : null}

      {phase === "done" ? (
        <InfoMessage>
          All events and markets have settled. Open the operator log to inspect
          each step.
        </InfoMessage>
      ) : null}
    </div>
  );
}

// MarketsReview lists the AI-drafted markets under an event during the review
// phase. Each market collapses to its question on the summary line and expands
// into a full MarketEditor so the operator can verify and tweak before any
// deploy call goes out.
function MarketsReview({
  markets,
  idPrefix,
  onChange,
}: {
  markets: MarketEditorState[];
  idPrefix: string;
  onChange: (next: MarketEditorState[]) => void;
}) {
  const update = (i: number, next: MarketEditorState) => {
    const arr = [...markets];
    arr[i] = next;
    onChange(arr);
  };
  const remove = (i: number) => {
    onChange(markets.filter((_, j) => j !== i));
  };
  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <div className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
        Markets ({markets.length}) — review &amp; edit before approval
      </div>
      {markets.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          The AI didn&apos;t draft any markets for this event.
        </p>
      ) : (
        <ul className="space-y-2">
          {markets.map((m, i) => (
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
                      {m.question || (
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
                      remove(i);
                    }}
                    className="text-xs text-danger hover:underline shrink-0"
                  >
                    Remove
                  </button>
                </summary>
                <div className="px-3 py-3 border-t border-border">
                  <MarketEditor
                    idPrefix={`${idPrefix}-market-${i}`}
                    value={m}
                    onChange={(next) => update(i, next)}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
