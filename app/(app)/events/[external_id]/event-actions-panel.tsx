"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, ErrorMessage, buttonVariants } from "@/components/ui";
import type { EventResponse } from "@/lib/types";

type EventActionKey = "pause" | "unpause" | "activate" | "deactivate";

// EventActionsPanel renders the dpm-api event lifecycle controls. Visibility
// mirrors the dpm-api LifecycleHandler — pause/unpause flip a single bool.
// activate/deactivate also flip a single bool (event.active), so they are
// shown as one toggle button whose label reflects the current state instead
// of two separately-visible buttons.
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

  const showActiveToggle = !event.archived;
  const showPause = !event.paused && !event.archived;
  const showUnpause = event.paused;

  if (!showActiveToggle && !showPause && !showUnpause) {
    return (
      <p className="text-xs text-foreground-muted">
        No lifecycle actions available — event is archived.
      </p>
    );
  }

  // One button, two states: active → clicking it deactivates (and vice
  // versa), so the label always names the action that will fire, not the
  // current state.
  const activeToggleKey: EventActionKey = event.active ? "deactivate" : "activate";
  const activeToggleLabel = event.active ? "Inactive" : "Activate";
  const activeTogglePendingLabel = event.active ? "Deactivating…" : "Activating…";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {showActiveToggle ? (
          <button
            type="button"
            onClick={() => fire(activeToggleKey)}
            disabled={isPending}
            className={event.active ? buttonVariants.danger : buttonVariants.primary}
            title={
              event.active
                ? "Set event.active=false — hides the event from users."
                : "Set event.active=true. Idempotent."
            }
          >
            {pending === activeToggleKey ? activeTogglePendingLabel : activeToggleLabel}
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
