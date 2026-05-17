"use client";

import Link from "next/link";
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
  DeployPlan,
  EventResponse,
  ManualAudit,
  MarketPayload,
  SeriesResponse,
  TagResponse,
} from "@/lib/types";

type AdaptResponse = {
  data: {
    series:
      | (Parameters<typeof seriesEditorStateFromPayload>[0] | null)
      | null;
    event: Parameters<typeof eventEditorStateFromPayload>[0];
    markets: MarketPayload[];
    tags: { slug: string; label: string }[];
  };
  source: { slug: string; gammaUrl: string };
};

type Phase =
  | "input"
  | "review"
  | "creating-series"
  | "creating-event"
  | "deploying-markets"
  | "done";

export function FromSlugForm() {
  const [slug, setSlug] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Set after the AI adapt step.
  const [seriesState, setSeriesState] = useState<SeriesEditorState | null>(
    null,
  );
  const [includeSeries, setIncludeSeries] = useState(true);
  const [eventState, setEventState] = useState<EventEditorState | null>(null);
  const [drafts, setDrafts] = useState<MarketEditorState[]>([]);
  const [tagDrafts, setTagDrafts] = useState<{ slug: string; label: string }[]>(
    [],
  );

  // Set after the chained creates.
  const [createdSeries, setCreatedSeries] = useState<SeriesResponse | null>(
    null,
  );
  const [createdEvent, setCreatedEvent] = useState<EventResponse | null>(null);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [correlationId] = useState<string>(() => newUUID());

  const fetchAdapt = () => {
    setError(null);
    if (!slug.trim()) {
      setError("Slug is required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/manual/adapt-slug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: slug.trim() }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        const out = (await res.json()) as AdaptResponse;
        setSeriesState(
          out.data.series
            ? seriesEditorStateFromPayload(out.data.series)
            : emptySeriesEditorState(),
        );
        setIncludeSeries(Boolean(out.data.series));
        setEventState(eventEditorStateFromPayload(out.data.event));
        setDrafts(
          out.data.markets
            .map(marketDraftToPayload)
            .map((p) => marketEditorStateFromPayload(p as MarketPayload)),
        );
        setTagDrafts(out.data.tags);
        setPhase("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const audit: ManualAudit = { correlation_id: correlationId };

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
        // Skip individual tag failures — the rest of the chain proceeds.
      }
    }
    return ids;
  };

  const startChain = () => {
    setError(null);
    if (!eventState) return;
    startTransition(async () => {
      try {
        // Series first (optional).
        let seriesExternalId: string | undefined;
        if (includeSeries && seriesState) {
          setPhase("creating-series");
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
          const series = (await res.json()) as SeriesResponse;
          setCreatedSeries(series);
          seriesExternalId = series.external_id;
        }

        // Tags (best-effort).
        const tagIds = await upsertTags();

        // Event next.
        setPhase("creating-event");
        const eventPayload = eventEditorStateToPayload(eventState);
        if (seriesExternalId)
          eventPayload.series_external_id = seriesExternalId;
        if (tagIds.length) eventPayload.tag_ids = tagIds;
        const eventRes = await fetch("/api/manual/events/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...audit, payload: eventPayload }),
        });
        if (!eventRes.ok) {
          const body = (await eventRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(`event: ${body.error ?? eventRes.status}`);
        }
        const event = (await eventRes.json()) as EventResponse;
        setCreatedEvent(event);

        // Create the deploy plan in the backend so execution survives UI/server
        // restarts. The DeployPlanDriver below is a pure observer over it.
        const planRes = await fetch("/api/manual/deploy-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...audit,
            event_external_id: event.external_id,
            event_id: event.id,
            note: `From Polymarket slug: ${slug}`,
            markets: drafts.map((m) =>
              marketEditorStateToPayload(m, {
                event_id: event.id,
                event_external_id: event.external_id,
              }),
            ),
          }),
        });
        if (!planRes.ok) {
          const body = (await planRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(`plan: ${body.error ?? planRes.status}`);
        }
        const plan = (await planRes.json()) as DeployPlan;
        setCreatedPlanId(plan.external_id);

        // Hand off to the observer.
        setPhase("deploying-markets");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("review");
      }
    });
  };

  if (phase === "input") {
    return (
      <Card>
        <CardBody className="space-y-3">
          <Field label="Polymarket event slug" htmlFor="slug">
            <input
              id="slug"
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. presidential-election-winner-2024"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fetchAdapt();
                }
              }}
            />
          </Field>
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={fetchAdapt}
              disabled={pending}
              className={buttonVariants.primary}
            >
              {pending ? "Fetching & adapting…" : "Fetch & adapt"}
            </button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <InfoMessage>
        Slug: <span className="font-mono">{slug}</span> · correlation_id:{" "}
        <span className="font-mono">{correlationId}</span>
      </InfoMessage>

      {seriesState ? (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-semibold">Series</h2>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeSeries}
                onChange={(e) => setIncludeSeries(e.target.checked)}
                disabled={
                  phase === "creating-series" ||
                  phase === "creating-event" ||
                  phase === "deploying-markets"
                }
              />
              Create series row
            </label>
          </CardHeader>
          <CardBody>
            {includeSeries ? (
              createdSeries ? (
                <p className="text-sm">
                  ✓ Created — external_id{" "}
                  <code className="font-mono">{createdSeries.external_id}</code>
                </p>
              ) : (
                <SeriesEditor
                  value={seriesState}
                  onChange={setSeriesState}
                  idPrefix="slug-series"
                />
              )
            ) : (
              <p className="text-sm text-foreground-muted">
                Series will be skipped. The event will not be linked to a series.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {eventState ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Event</h2>
          </CardHeader>
          <CardBody>
            {createdEvent ? (
              <p className="text-sm">
                ✓ Created — external_id{" "}
                <code className="font-mono">{createdEvent.external_id}</code>
              </p>
            ) : (
              <EventEditor
                value={eventState}
                onChange={setEventState}
                idPrefix="slug-event"
              />
            )}
          </CardBody>
        </Card>
      ) : null}

      {phase === "review" ? (
        <>
          <Card>
            <CardHeader>
              <h2 className="font-semibold">
                Markets ({drafts.length}){" "}
                <span className="text-xs text-foreground-muted font-normal">
                  · expand to edit before approval
                </span>
              </h2>
            </CardHeader>
            <CardBody>
              {drafts.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No markets drafted.
                </p>
              ) : (
                <ul className="space-y-2">
                  {drafts.map((m, i) => (
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
                              setDrafts(drafts.filter((_, j) => j !== i));
                            }}
                            className="text-xs text-danger hover:underline shrink-0"
                          >
                            Remove
                          </button>
                        </summary>
                        <div className="px-3 py-3 border-t border-border">
                          <MarketEditor
                            idPrefix={`slug-market-${i}`}
                            value={m}
                            onChange={(next) => {
                              const arr = [...drafts];
                              arr[i] = next;
                              setDrafts(arr);
                            }}
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
              disabled={pending || !eventState}
              className={buttonVariants.primary}
            >
              {pending ? "Creating…" : "Create series + event, then deploy markets"}
            </button>
          </div>
        </>
      ) : null}

      {phase === "deploying-markets" && createdPlanId ? (
        <>
          <InfoMessage>
            Plan persisted to the backend — execution will continue even if you
            close this tab.{" "}
            <Link
              href={`/deploy-plans/${encodeURIComponent(createdPlanId)}`}
              className="underline"
            >
              Open plan page →
            </Link>
          </InfoMessage>
          <DeployPlanDriver
            planExternalId={createdPlanId}
            onCompleted={() => setPhase("done")}
          />
        </>
      ) : null}

      {phase === "done" && createdPlanId ? (
        <InfoMessage>
          All markets settled.{" "}
          <Link
            href={`/deploy-plans/${encodeURIComponent(createdPlanId)}`}
            className="underline"
          >
            View final plan
          </Link>
          {" · "}
          <Link
            href="/operator-log?source=manual"
            className="underline"
          >
            Operator log
          </Link>
        </InfoMessage>
      ) : null}
    </div>
  );
}
