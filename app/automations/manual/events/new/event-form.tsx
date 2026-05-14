"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  Card,
  CardBody,
  ErrorMessage,
  buttonVariants,
} from "@/components/ui";
import {
  EventEditor,
  emptyEventEditorState,
  eventEditorStateToPayload,
  type EventEditorState,
} from "@/components/manual/event-editor";
import { isMetadataValid } from "@/lib/manual/helpers";
import type { EventResponse } from "@/lib/types";

export function EventForm({
  initialSeriesExternalId,
}: {
  initialSeriesExternalId?: string;
}) {
  const [state, setState] = useState<EventEditorState>(() => {
    const base = emptyEventEditorState();
    if (initialSeriesExternalId) {
      base.series_external_id = initialSeriesExternalId;
    }
    return base;
  });
  const [created, setCreated] = useState<EventResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!state.slug.trim() || !state.title.trim()) {
      setError("Slug and title are required");
      return;
    }
    if (state.metadataText.trim() && !isMetadataValid(state.metadataText)) {
      setError("Metadata must be valid JSON");
      return;
    }
    startTransition(async () => {
      try {
        const payload = eventEditorStateToPayload(state);
        const res = await fetch("/api/manual/events/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as EventResponse;
        setCreated(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  if (created) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <div className="text-sm">
            <span className="font-semibold">Event created.</span>{" "}
            <span className="text-foreground-muted">external_id:</span>{" "}
            <code className="font-mono">{created.external_id}</code>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/automations/manual/events/${encodeURIComponent(created.external_id)}/markets/new`}
              className={buttonVariants.primary}
            >
              Add markets to this event
            </Link>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setState(emptyEventEditorState());
              }}
              className={buttonVariants.secondary}
            >
              Create another
            </button>
            <Link href="/automations/manual" className={buttonVariants.ghost}>
              Done
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <EventEditor value={state} onChange={setState} />
        </CardBody>
      </Card>

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <div className="flex justify-end gap-2">
        <Link href="/automations/manual" className={buttonVariants.ghost}>
          Cancel
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className={buttonVariants.primary}
        >
          {pending ? "Creating…" : "Create event"}
        </button>
      </div>
    </div>
  );
}
