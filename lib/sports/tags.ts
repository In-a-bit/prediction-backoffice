import type { SportsTagSpec } from "@/lib/types";

// slugify mirrors what the backend would do: lowercase, kebab-case, trim
// leading/trailing dashes. Used client-side to derive the upsert key from a
// human-typed label.
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// buildTags turns display labels into slug+label chips, skipping empties and
// duplicates so a league already named after its country doesn't produce two
// identical tags.
export function buildTags(labels: (string | undefined)[]): SportsTagSpec[] {
  const out: SportsTagSpec[] = [];
  for (const raw of labels) {
    const label = raw?.trim();
    if (!label) continue;
    const slug = slugify(label);
    if (!slug || out.some((tag) => tag.slug === slug)) continue;
    out.push({ slug, label });
  }
  return out;
}
