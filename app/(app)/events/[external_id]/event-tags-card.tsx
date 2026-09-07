"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, ErrorMessage, buttonVariants, inputClass } from "@/components/ui";
import { normalizeTagSlug, slugifyTagInput } from "@/lib/manual/tags";
import type { TagResponse } from "@/lib/types";

// EventTagsEditor manages the tags attached to an already-created event.
// Unlike the manual-creator editors — which batch pending drafts until the
// event is submitted — every action here writes through immediately, because
// the event already exists: add upserts the tag by slug and attaches it,
// remove detaches it. Both backoffice endpoints are idempotent.
export function EventTagsEditor({
  externalId,
  tags,
}: {
  externalId: string;
  tags: TagResponse[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const add = () => {
    // Slugify what the operator typed; the label keeps their raw text.
    const slugTrim = slugifyTagInput(slug);
    if (!slugTrim) return;
    setError(null);
    if (tags.some((t) => normalizeTagSlug(t.slug) === slugTrim)) {
      setError(`"${slugTrim}" is already attached`);
      return;
    }
    setBusy(`add:${slugTrim}`);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/manual/events/${encodeURIComponent(externalId)}/tags`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug: slugTrim,
              label: label.trim() || slug.trim(),
            }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        setSlug("");
        setLabel("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    });
  };

  const remove = (tag: TagResponse) => {
    setError(null);
    setBusy(`remove:${tag.id}`);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/manual/events/${encodeURIComponent(externalId)}/tags/${tag.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `request failed with ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
          tags
        </span>
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            setError(null);
          }}
          className="text-xs text-foreground-muted hover:underline"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 ? (
          <span className="text-xs text-foreground-muted">No tags attached</span>
        ) : null}
        {tags.map((t) =>
          editing ? (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 border border-border px-2 py-0.5 text-xs"
              title={`dpm tag #${t.id} · ${t.slug}`}
            >
              <span>{t.label || t.slug}</span>
              <button
                type="button"
                onClick={() => remove(t)}
                disabled={busy !== null}
                className="text-danger ml-1 leading-none disabled:opacity-40"
                aria-label={`Remove ${t.label || t.slug}`}
              >
                {busy === `remove:${t.id}` ? "…" : "×"}
              </button>
            </span>
          ) : (
            <Badge key={t.id} tone="neutral">
              {t.label || t.slug}
            </Badge>
          ),
        )}
      </div>

      {editing ? (
        <>
          <div className="flex gap-2">
            <input
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
              disabled={busy !== null || !slug.trim()}
              className={buttonVariants.secondary}
            >
              {busy?.startsWith("add:") ? "Adding…" : "Add"}
            </button>
          </div>
          <p className="text-[11px] text-foreground-muted">
            Unknown slugs are created in dpm-api on add.
          </p>
        </>
      ) : null}

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </div>
  );
}
