"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorMessage, buttonVariants } from "@/components/ui";

export function SportEventActions({
  eventId,
  sportTaskId,
  hasCreationPlan,
  isSkipped,
}: {
  eventId: number;
  sportTaskId: number;
  hasCreationPlan: boolean;
  isSkipped: boolean;
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
        onClick={() =>
          post(
            `/api/sports/events/${eventId}/force-create`,
            "Force-create now? This skips the time_ahead_hours gate and creates a DeployPlan immediately.",
          )
        }
      >
        {hasCreationPlan ? "Plan already created" : "Force create now"}
      </button>

      <button
        type="button"
        className={buttonVariants.secondary}
        disabled={pending || isSkipped}
        onClick={() =>
          post(
            `/api/sports/events/${eventId}/skip`,
            "Skip auto-creation? The upcoming ticker will leave this fixture alone. Markets that already exist keep their lifecycle.",
          )
        }
      >
        {isSkipped ? "Skipped" : "Skip auto-creation"}
      </button>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {/* sportTaskId is reserved for future per-league overrides on this page */}
      <input type="hidden" value={sportTaskId} readOnly />
    </div>
  );
}
