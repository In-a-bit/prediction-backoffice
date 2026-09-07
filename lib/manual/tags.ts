// Tag helpers shared by the manual-creator forms and the event detail page.
//
// Tags live in dpm-api and are addressed by slug: POST /manual/tags is an
// upsert, so resolving a {slug,label} pair either returns the existing row or
// creates it. The editors therefore carry EventTagDrafts (which may be
// pending, i.e. have no id yet) and resolve them to numeric ids only at
// submit time — nothing is written to dpm-api while the operator is still
// reviewing a draft.

import { suggestSlug } from "@/lib/manual/helpers";
import type { EventTagDraft, TagResponse } from "@/lib/types";

// Comparison key. Applied to every slug, including ones supplied by
// Polymarket / the AI, so "Politics " and "politics" don't produce two rows.
// Deliberately does NOT rewrite the slug's shape — source slugs are already
// URL-safe and mangling them would create a divergent row.
export function normalizeTagSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

// Slug for free text an operator typed into the tag inputs. Unlike source
// slugs this needs real slugification, or typing "US Politics" would create a
// tag whose slug contains a space.
export function slugifyTagInput(raw: string): string {
  return suggestSlug(raw);
}

// Merge tag lists, de-duplicating by slug. Earlier lists win, so a draft that
// already carries an id is not replaced by a bare {slug,label} for the same
// slug.
export function mergeTagDrafts(
  ...lists: (EventTagDraft[] | undefined)[]
): EventTagDraft[] {
  const bySlug = new Map<string, EventTagDraft>();
  for (const list of lists) {
    for (const t of list ?? []) {
      const slug = normalizeTagSlug(t.slug);
      if (!slug || bySlug.has(slug)) continue;
      bySlug.set(slug, { ...t, slug, label: t.label?.trim() || slug });
    }
  }
  return [...bySlug.values()];
}

export function tagDraftsFromResponses(
  tags: TagResponse[] | undefined | null,
): EventTagDraft[] {
  return (tags ?? []).map((t) => ({ id: t.id, slug: t.slug, label: t.label }));
}

// Upsert every pending draft and return the full ordered id list.
//
// Deliberately NOT best-effort: the earlier implementation swallowed per-tag
// failures, which is how operator-added tags silently vanished from created
// events. A failed upsert now aborts the whole create so the operator sees
// which slug broke instead of discovering a half-tagged event later.
//
// `cache` lets a multi-event chain (the series-of-events flow) upsert each
// distinct slug once instead of re-POSTing the same tags for every event.
export async function resolveTagIds(
  drafts: EventTagDraft[] | undefined,
  cache?: Map<string, number>,
): Promise<number[]> {
  const ids: number[] = [];
  for (const t of mergeTagDrafts(drafts)) {
    if (typeof t.id === "number") {
      ids.push(t.id);
      continue;
    }
    const cached = cache?.get(t.slug);
    if (cached !== undefined) {
      ids.push(cached);
      continue;
    }
    const res = await fetch("/api/manual/tags/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: t.slug, label: t.label }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        `tag "${t.slug}": ${body.error ?? `upsert failed with ${res.status}`}`,
      );
    }
    const data = (await res.json()) as TagResponse;
    cache?.set(t.slug, data.id);
    ids.push(data.id);
  }
  return ids;
}
