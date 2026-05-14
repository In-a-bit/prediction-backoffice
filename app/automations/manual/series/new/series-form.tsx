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
  SeriesEditor,
  emptySeriesEditorState,
  seriesEditorStateToPayload,
  type SeriesEditorState,
} from "@/components/manual/series-editor";
import { isMetadataValid } from "@/lib/manual/helpers";
import type { SeriesResponse } from "@/lib/types";

export function SeriesForm() {
  const [state, setState] = useState<SeriesEditorState>(emptySeriesEditorState);
  const [created, setCreated] = useState<SeriesResponse | null>(null);
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
        const payload = seriesEditorStateToPayload(state);
        const res = await fetch("/api/manual/series/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        const data = (await res.json()) as SeriesResponse;
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
            <span className="font-semibold">Series created.</span>{" "}
            <span className="text-foreground-muted">
              external_id:
            </span>{" "}
            <code className="font-mono">{created.external_id}</code>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/automations/manual/events/new?series_external_id=${encodeURIComponent(created.external_id)}`}
              className={buttonVariants.primary}
            >
              Add an event under this series
            </Link>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setState(emptySeriesEditorState());
              }}
              className={buttonVariants.secondary}
            >
              Create another
            </button>
            <Link
              href="/automations/manual"
              className={buttonVariants.ghost}
            >
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
          <SeriesEditor value={state} onChange={setState} />
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
          {pending ? "Creating…" : "Create series"}
        </button>
      </div>
    </div>
  );
}
