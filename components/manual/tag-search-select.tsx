"use client";

import { useState } from "react";

import { buttonVariants, inputClass } from "@/components/ui";
import {
  mergeTagDrafts,
  normalizeTagSlug,
  slugifyTagInput,
} from "@/lib/manual/tags";
import type { EventTagDraft } from "@/lib/types";

// TagSearchSelect edits the tag list attached to an event as {slug,label}
// drafts. Nothing is written to dpm-api here — the caller upserts the pending
// drafts (via resolveTagIds) when the event is actually created, so an
// operator can add, remove, and re-add tags freely while reviewing a draft.
//
// Drafts that already carry an id came from a real dpm-api tag row (an
// existing event, or an earlier resolve); the rest are marked "pending" so it
// is obvious which tags this submit will create.
export function TagSearchSelect({
  value,
  onChange,
  idPrefix = "tags",
}: {
  value: EventTagDraft[];
  onChange: (next: EventTagDraft[]) => void;
  idPrefix?: string;
}) {
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setError(null);
    // The slug is slugified, the label keeps the operator's raw text — typing
    // "US Politics" gives slug "us-politics" labelled "US Politics".
    const slugTrim = slugifyTagInput(slug);
    if (!slugTrim) return;
    if (value.some((t) => normalizeTagSlug(t.slug) === slugTrim)) {
      setError(`"${slugTrim}" is already attached`);
      return;
    }
    onChange(
      mergeTagDrafts(value, [
        { slug: slugTrim, label: label.trim() || slug.trim() },
      ]),
    );
    setSlug("");
    setLabel("");
  };

  const remove = (slugToDrop: string) =>
    onChange(value.filter((t) => t.slug !== slugToDrop));

  const pendingCount = value.filter((t) => typeof t.id !== "number").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 ? (
          <span className="text-xs text-foreground-muted">No tags</span>
        ) : null}
        {value.map((t) => (
          <span
            key={t.slug}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
              typeof t.id === "number"
                ? "bg-foreground/5 border-border"
                : "bg-warning/10 border-warning/40"
            }`}
            title={
              typeof t.id === "number"
                ? `dpm tag #${t.id}`
                : "Pending — this tag is created when you submit"
            }
          >
            <span>{t.label}</span>
            {t.label !== t.slug ? (
              <span className="text-foreground-muted">({t.slug})</span>
            ) : null}
            <button
              type="button"
              onClick={() => remove(t.slug)}
              className="text-danger ml-1 leading-none"
              aria-label={`Remove ${t.label}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {pendingCount > 0 ? (
        <span className="text-[11px] text-foreground-muted">
          {pendingCount} pending — created in dpm-api on submit.
        </span>
      ) : null}

      <div className="flex gap-2">
        <input
          id={`${idPrefix}-slug`}
          className={inputClass}
          placeholder="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <input
          id={`${idPrefix}-label`}
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
          disabled={!slug.trim()}
          className={buttonVariants.secondary}
        >
          Add
        </button>
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
