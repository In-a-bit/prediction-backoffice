"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorMessage, buttonVariants } from "@/components/ui";

export function EventActions({
  eventId,
  hasDeployPlan,
  isSkipped,
}: {
  eventId: number;
  hasDeployPlan: boolean;
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
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
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
        disabled={pending || hasDeployPlan}
        title="Idempotently re-runs the per-slot Creator logic: ensures the dpm-api event exists, then spawns/re-spawns the DeployPlan if missing. Use this to retry after a tick error, or to force a slot in early."
        onClick={() =>
          post(
            `/api/crypto/events/${eventId}/force-create`,
            "Run create now? Re-attempts the dpm-api event-create step and spawns a DeployPlan if one isn't already running. Safe to retry — idempotent.",
          )
        }
      >
        {hasDeployPlan ? "Plan already created" : "Retry / force create"}
      </button>

      <button
        type="button"
        className={buttonVariants.secondary}
        disabled={pending || isSkipped}
        onClick={() =>
          post(
            `/api/crypto/events/${eventId}/skip`,
            "Skip this slot? The price-ticker + dispatcher will leave it alone. Use this when an event got stuck and you want to manually unstick.",
          )
        }
      >
        {isSkipped ? "Skipped" : "Skip event"}
      </button>

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
