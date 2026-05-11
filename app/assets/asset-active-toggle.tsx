"use client";

import { useState, useTransition } from "react";

import { updateAssetAction } from "@/lib/actions";

export function AssetActiveToggle({
  assetId,
  value,
}: {
  assetId: number;
  value: boolean;
}) {
  const [optimistic, setOptimistic] = useState(value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    startTransition(async () => {
      const res = await updateAssetAction(assetId, { is_active: next });
      if (!res.ok) {
        setOptimistic(!next);
        setError(res.error);
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2 justify-end">
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label="Toggle active"
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          optimistic ? "bg-success" : "bg-foreground/15"
        } ${pending ? "opacity-50" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            optimistic ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      {error ? (
        <span
          className="text-xs text-danger truncate max-w-[10rem]"
          title={error}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
