"use client";

import { useState, useTransition } from "react";

import { Badge, buttonVariants, inputClass } from "@/components/ui";
import type { TagResponse } from "@/lib/types";

// TagSearchSelect lets the operator add tags to an event by slug. Each entry
// is upserted server-side: if a tag with the same slug exists it is reused,
// otherwise it is created. Returned IDs are stored on the event.
export function TagSearchSelect({
  valueIds,
  onChange,
}: {
  valueIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const add = () => {
    setError(null);
    const slugTrim = slug.trim();
    const labelTrim = label.trim() || slugTrim;
    if (!slugTrim) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/manual/tags/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: slugTrim, label: labelTrim }),
        });
        if (!res.ok) {
          setError(`Upsert failed: ${res.status}`);
          return;
        }
        const data = (await res.json()) as TagResponse;
        if (!tags.some((t) => t.id === data.id)) {
          const nextTags = [...tags, data];
          setTags(nextTags);
          onChange(nextTags.map((t) => t.id));
        }
        setSlug("");
        setLabel("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upsert failed");
      }
    });
  };

  const remove = (id: number) => {
    const next = tags.filter((t) => t.id !== id);
    setTags(next);
    onChange(next.map((t) => t.id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.length === 0 && valueIds.length === 0 ? (
          <span className="text-xs text-foreground-muted">No tags</span>
        ) : null}
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 border border-border px-2 py-0.5 text-xs"
          >
            <span>{t.label}</span>
            <span className="text-foreground-muted">({t.slug})</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-danger ml-1 leading-none"
              aria-label={`Remove ${t.label}`}
            >
              ×
            </button>
          </span>
        ))}
        {/* IDs supplied by an external caller (e.g. AI draft) that we don't
            have full Tag rows for — show as bare badges so the operator
            knows they are still attached. */}
        {valueIds
          .filter((id) => !tags.some((t) => t.id === id))
          .map((id) => (
            <Badge key={id} tone="neutral">
              #{id}
            </Badge>
          ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={isPending || !slug.trim()}
          className={buttonVariants.secondary}
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
