"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorMessage, buttonVariants } from "@/components/ui";

export function SportEventActions({
  eventId,
  sportTaskId,
  hasCreationPlan,
}: {
  eventId: number;
  sportTaskId: number;
  hasCreationPlan: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const post = (path: string, confirmMessage?: string) => {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setError(`status ${res.status}: ${text}`);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mt-4">
      <button
        type="button"
        className={buttonVariants.primary}
        disabled={pending || hasCreationPlan}
        title="Idempotently re-runs the per-event Creator logic: ensures the dpm-api event exists, then spawns/re-spawns the DeployPlan if missing. Use this to retry after the upcoming-ticker hit an error, or to force a fixture in early before the time_ahead_hours window."
        onClick={() =>
          post(
            `/api/sports/events/${eventId}/force-create`,
            "Run create now? This re-attempts the dpm-api event-create step and spawns a DeployPlan immediately (skipping the time_ahead_hours gate). Safe to retry — idempotent if a plan already exists.",
          )
        }
      >
        {hasCreationPlan ? "Plan already created" : "Retry / force create"}
      </button>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {/* sportTaskId is reserved for future per-league overrides on this page */}
      <input type="hidden" value={sportTaskId} readOnly />
    </div>
  );
}
