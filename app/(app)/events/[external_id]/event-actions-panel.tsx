"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, ErrorMessage, buttonVariants } from "@/components/ui";
import type { EventResponse } from "@/lib/types";

type EventActionKey = "pause" | "unpause" | "activate" | "deactivate";

// EventActionsPanel renders the dpm-api event lifecycle controls. Visibility
// mirrors the dpm-api LifecycleHandler — pause/unpause flip a single bool,
// activate/deactivate flip event.active. We hide the no-op variants so the
// operator can't fire something that's already in the target state.
export function EventActionsPanel({
  externalId,
  event,
}: {
  externalId: string;
  event: EventResponse;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<EventActionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function fire(key: EventActionKey) {
    if (key === "deactivate") {
      const ok = window.confirm(
        "Deactivate this event? It will be hidden from users until you activate it again.",
      );
      if (!ok) return;
    }
    setError(null);
    setOk(null);
    setPending(key);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/dpm/events/${encodeURIComponent(externalId)}/${key}`,
          { method: "POST" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `request failed with ${res.status}`);
        }
        setOk(`${key} submitted`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(null);
      }
    });
  }

  const showPause = !event.paused && !event.archived;
  const showUnpause = event.paused;
  const showActivate = !event.active && !event.archived;
  const showDeactivate = event.active && !event.archived;

  if (!showPause && !showUnpause && !showActivate && !showDeactivate) {
    return (
      <p className="text-xs text-foreground-muted">
        No lifecycle actions available — event is archived.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {showActivate ? (
          <button
            type="button"
            onClick={() => fire("activate")}
            disabled={isPending}
            className={buttonVariants.primary}
            title="Set event.active=true. Idempotent."
          >
            {pending === "activate" ? "Activating…" : "Activate"}
          </button>
        ) : null}
        {showDeactivate ? (
          <button
            type="button"
            onClick={() => fire("deactivate")}
            disabled={isPending}
            className={buttonVariants.danger}
            title="Set event.active=false — hides the event from users."
          >
            {pending === "deactivate" ? "Deactivating…" : "Deactivate"}
          </button>
        ) : null}
        {showPause ? (
          <button
            type="button"
            onClick={() => fire("pause")}
            disabled={isPending}
            className={buttonVariants.secondary}
            title="Flip paused=true — halts trading on every market in the event."
          >
            {pending === "pause" ? "Pausing…" : "Pause event"}
          </button>
        ) : null}
        {showUnpause ? (
          <button
            type="button"
            onClick={() => fire("unpause")}
            disabled={isPending}
            className={buttonVariants.secondary}
            title="Flip paused=false — resumes trading."
          >
            {pending === "unpause" ? "Resuming…" : "Resume event"}
          </button>
        ) : null}
      </div>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {ok ? <Badge tone="success">{ok}</Badge> : null}
    </div>
  );
}
