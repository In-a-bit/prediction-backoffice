"use client";

import { useMemo, useState } from "react";

import { Badge, buttonVariants } from "@/components/ui";
import type { SportsTagSpec } from "@/lib/types";

// TagChipsEditor renders an auditable list of slug+label tag chips with
// add/remove. Slugs are the upsert key (backend calls dpm-api UpsertTag);
// labels are operator-facing display text. Defaults can be seeded from
// the parent (league name, year, country, etc.) and the operator can
// freely add or remove entries.
//
// `existingByLabel` lets the parent pass in known existing tags so we can
// flag chips that are new vs reused. (Optional — when not provided, every
// chip is rendered neutrally and the backend's upsert handles dedupe.)
export function TagChipsEditor({
  value,
  onChange,
  knownSlugs,
}: {
  value: SportsTagSpec[];
  onChange: (next: SportsTagSpec[]) => void;
  knownSlugs?: Set<string>;
}) {
  const [draftLabel, setDraftLabel] = useState("");

  const slugSet = useMemo(() => new Set(value.map((t) => t.slug)), [value]);

  const addFromLabel = (raw: string) => {
    const label = raw.trim();
    if (!label) return;
    const slug = slugify(label);
    if (!slug) return;
    if (slugSet.has(slug)) {
      setDraftLabel("");
      return;
    }
    onChange([...value, { slug, label }]);
    setDraftLabel("");
  };

  const remove = (slug: string) => {
    onChange(value.filter((t) => t.slug !== slug));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.length === 0 && (
          <span className="text-xs text-foreground-muted">No tags yet — type one below.</span>
        )}
        {value.map((tag) => {
          const isKnown = knownSlugs ? knownSlugs.has(tag.slug) : null;
          return (
            <div
              key={tag.slug}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover px-2.5 py-1 text-xs"
              title={`slug: ${tag.slug}`}
            >
              <span>{tag.label || tag.slug}</span>
              <span className="text-foreground-muted/70 font-mono text-[10px]">
                {tag.slug}
              </span>
              {isKnown === true && <Badge tone="success">existing</Badge>}
              {isKnown === false && <Badge tone="info">new</Badge>}
              <button
                type="button"
                onClick={() => remove(tag.slug)}
                aria-label={`Remove ${tag.label || tag.slug}`}
                className="ml-1 text-foreground-muted hover:text-danger leading-none"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1"
          placeholder="Add a tag — type a human label, slug auto-derived (e.g. 'Premier League' → 'premier-league')"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromLabel(draftLabel);
            }
          }}
        />
        <button
          type="button"
          className={buttonVariants.secondary}
          onClick={() => addFromLabel(draftLabel)}
          disabled={!draftLabel.trim()}
        >
          Add
        </button>
      </div>
      <div className="text-[11px] text-foreground-muted">
        Tags are upserted by slug — unknown slugs are created in dpm-api on submit, existing slugs
        are reused. Each chip shows its slug after its label.
      </div>
    </div>
  );
}

// slugify mirrors what the backend would do: lowercase, kebab-case,
// trim leading/trailing dashes. Used purely client-side to derive the
// upsert key from a human-typed label.
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// suggestSoccerTags builds the auto-seeded tag set for a league config:
// league name, season label, country, plus the constants "soccer" and
// "football". Skips empty / duplicate entries.
export function suggestSoccerTags(opts: {
  leagueName?: string;
  country?: string;
  season: number;
}): SportsTagSpec[] {
  const out: SportsTagSpec[] = [];
  const push = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const slug = slugify(trimmed);
    if (!slug) return;
    if (out.some((t) => t.slug === slug)) return;
    out.push({ slug, label: trimmed });
  };
  if (opts.leagueName) push(opts.leagueName);
  push(`${opts.season}/${opts.season + 1}`);
  if (opts.country) push(opts.country);
  push("Soccer");
  push("Football");
  return out;
}
