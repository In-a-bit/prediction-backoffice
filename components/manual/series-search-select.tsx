"use client";

import { useEffect, useState, useTransition } from "react";

import { Badge, buttonVariants, inputClass } from "@/components/ui";
import type { SeriesResponse } from "@/lib/types";

// SeriesSearchSelect lets the operator look up an existing series by slug
// and stamp its external_id onto an event being created. There is no
// list-series endpoint on dpm-api today, so this is intentionally an
// exact-slug lookup rather than a fuzzy search.
export function SeriesSearchSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (externalId: string) => void;
}) {
  const [slug, setSlug] = useState("");
  const [resolved, setResolved] = useState<SeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // If `value` (the linked external_id) is set on mount but we don't yet have
  // the series details, leave the row collapsed — the operator already chose.
  useEffect(() => {
    if (!value) setResolved(null);
  }, [value]);

  const lookup = () => {
    setError(null);
    if (!slug.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/manual/series/by-slug?slug=${encodeURIComponent(slug.trim())}`,
        );
        if (!res.ok) {
          if (res.status === 404) setError("No series found with that slug");
          else setError(`Lookup failed: ${res.status}`);
          setResolved(null);
          return;
        }
        const data = (await res.json()) as SeriesResponse;
        setResolved(data);
        onChange(data.external_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed");
      }
    });
  };

  const clear = () => {
    setResolved(null);
    setSlug("");
    onChange("");
  };

  if (value && resolved) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-foreground/[0.03] px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{resolved.title}</span>
          <span className="text-[11px] text-foreground-muted font-mono">
            {resolved.external_id}
          </span>
        </div>
        <button
          type="button"
          onClick={clear}
          className={buttonVariants.ghost}
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="series slug to look up"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lookup();
            }
          }}
        />
        <button
          type="button"
          onClick={lookup}
          disabled={isPending || !slug.trim()}
          className={buttonVariants.secondary}
        >
          {isPending ? "Looking up…" : "Look up"}
        </button>
      </div>
      {value && !resolved ? (
        <div className="flex items-center gap-2 text-xs text-foreground-muted">
          <Badge tone="info">linked</Badge>
          <span className="font-mono break-all">{value}</span>
          <button
            type="button"
            onClick={clear}
            className="text-danger hover:underline"
          >
            clear
          </button>
        </div>
      ) : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
