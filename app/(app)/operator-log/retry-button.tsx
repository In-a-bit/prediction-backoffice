"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui";

// Client-side button for the operator-log "Retry" affordance. Posts to the
// new /api/manual/operator-log/:external_id/retry proxy and refreshes the page
// so the new chained log row shows up. Scoped to failed create_series /
// create_event entries — the surrounding LogRow guards on action + status
// before rendering this.
export function RetryLogButton({ externalId }: { externalId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/manual/operator-log/${encodeURIComponent(externalId)}/retry`,
          { method: "POST" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={buttonVariants.primary}
        title="Re-run this failed dpm-api call. The retry first checks (by slug) whether dpm-api already has the row, and only POSTs if not."
      >
        {isPending ? "Retrying…" : "Retry"}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
