"use client";

import {
  AdvancedCollapse,
  BoolSelect,
  Field,
  JsonField,
  inputClass,
} from "@/components/ui";
import {
  isMetadataValid,
  parseMetadata,
  stringifyMetadata,
  suggestSlug,
} from "@/lib/manual/helpers";
import type { SeriesPayload } from "@/lib/types";

export type SeriesEditorState = Omit<SeriesPayload, "metadata"> & {
  metadataText: string;
};

export function emptySeriesEditorState(): SeriesEditorState {
  return {
    slug: "",
    title: "",
    ticker: "",
    description: "",
    icon: "",
    series_type: "",
    recurrence: "",
    active: undefined,
    closed: undefined,
    archived: undefined,
    restricted: undefined,
    featured: undefined,
    new: undefined,
    requires_translation: undefined,
    comment_count: undefined,
    metadata_type: "",
    metadataText: "",
  };
}

export function seriesEditorStateFromPayload(
  p: SeriesPayload,
): SeriesEditorState {
  return {
    ...p,
    ticker: p.ticker ?? "",
    description: p.description ?? "",
    icon: p.icon ?? "",
    series_type: p.series_type ?? "",
    recurrence: p.recurrence ?? "",
    metadata_type: p.metadata_type ?? "",
    metadataText: stringifyMetadata(p.metadata),
  };
}

// Strip empty strings → undefined and parse the metadata textarea so the
// payload sent to dpm-api is clean.
export function seriesEditorStateToPayload(
  s: SeriesEditorState,
): SeriesPayload {
  const cleanString = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return {
    slug: s.slug.trim(),
    title: s.title.trim(),
    ticker: cleanString(s.ticker),
    description: cleanString(s.description),
    icon: cleanString(s.icon),
    series_type: cleanString(s.series_type),
    recurrence: cleanString(s.recurrence),
    active: s.active,
    closed: s.closed,
    archived: s.archived,
    restricted: s.restricted,
    featured: s.featured,
    new: s.new,
    requires_translation: s.requires_translation,
    comment_count: s.comment_count,
    metadata_type: cleanString(s.metadata_type),
    metadata: parseMetadata(s.metadataText),
  };
}

export function SeriesEditor({
  value,
  onChange,
  idPrefix = "series",
}: {
  value: SeriesEditorState;
  onChange: (next: SeriesEditorState) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof SeriesEditorState>(
    key: K,
    v: SeriesEditorState[K],
  ) => onChange({ ...value, [key]: v });

  const metadataInvalid =
    value.metadataText.trim() !== "" && !isMetadataValid(value.metadataText);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Title"
          required
          htmlFor={`${idPrefix}-title`}
        >
          <input
            id={`${idPrefix}-title`}
            className={inputClass}
            value={value.title}
            onChange={(e) => {
              const next = e.target.value;
              const shouldFillSlug = !value.slug || value.slug === suggestSlug(value.title);
              onChange({
                ...value,
                title: next,
                slug: shouldFillSlug ? suggestSlug(next) : value.slug,
              });
            }}
          />
        </Field>
        <Field
          label="Slug"
          required
          htmlFor={`${idPrefix}-slug`}
          hint="URL-safe, lowercase, hyphens. Auto-derived from title until you edit it."
        >
          <input
            id={`${idPrefix}-slug`}
            className={inputClass}
            value={value.slug}
            onChange={(e) => set("slug", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor={`${idPrefix}-description`}>
        <textarea
          id={`${idPrefix}-description`}
          className={inputClass}
          rows={3}
          value={value.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Ticker" htmlFor={`${idPrefix}-ticker`}>
          <input
            id={`${idPrefix}-ticker`}
            className={inputClass}
            value={value.ticker ?? ""}
            onChange={(e) => set("ticker", e.target.value)}
          />
        </Field>
        <Field label="Series type" htmlFor={`${idPrefix}-series-type`}>
          <input
            id={`${idPrefix}-series-type`}
            className={inputClass}
            placeholder="e.g. crypto, sports, politics"
            value={value.series_type ?? ""}
            onChange={(e) => set("series_type", e.target.value)}
          />
        </Field>
        <Field label="Recurrence" htmlFor={`${idPrefix}-recurrence`}>
          <input
            id={`${idPrefix}-recurrence`}
            className={inputClass}
            placeholder="e.g. weekly, daily"
            value={value.recurrence ?? ""}
            onChange={(e) => set("recurrence", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Active" htmlFor={`${idPrefix}-active`}>
        <BoolSelect
          id={`${idPrefix}-active`}
          value={value.active}
          onChange={(v) => set("active", v)}
        />
      </Field>

      <AdvancedCollapse>
        <Field label="Icon URL" htmlFor={`${idPrefix}-icon`}>
          <input
            id={`${idPrefix}-icon`}
            className={inputClass}
            value={value.icon ?? ""}
            onChange={(e) => set("icon", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Closed">
            <BoolSelect value={value.closed} onChange={(v) => set("closed", v)} />
          </Field>
          <Field label="Archived">
            <BoolSelect
              value={value.archived}
              onChange={(v) => set("archived", v)}
            />
          </Field>
          <Field label="Restricted">
            <BoolSelect
              value={value.restricted}
              onChange={(v) => set("restricted", v)}
            />
          </Field>
          <Field label="Featured">
            <BoolSelect
              value={value.featured}
              onChange={(v) => set("featured", v)}
            />
          </Field>
          <Field label="New">
            <BoolSelect value={value.new} onChange={(v) => set("new", v)} />
          </Field>
          <Field label="Requires translation">
            <BoolSelect
              value={value.requires_translation}
              onChange={(v) => set("requires_translation", v)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Comment count" htmlFor={`${idPrefix}-comments`}>
            <input
              id={`${idPrefix}-comments`}
              type="number"
              min={0}
              className={inputClass}
              value={value.comment_count ?? ""}
              onChange={(e) =>
                set(
                  "comment_count",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </Field>
          <Field label="Metadata type" htmlFor={`${idPrefix}-metadata-type`}>
            <input
              id={`${idPrefix}-metadata-type`}
              className={inputClass}
              value={value.metadata_type ?? ""}
              onChange={(e) => set("metadata_type", e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Metadata (JSON)"
          htmlFor={`${idPrefix}-metadata`}
          error={metadataInvalid ? "Invalid JSON" : undefined}
        >
          <JsonField
            id={`${idPrefix}-metadata`}
            value={value.metadataText}
            onChange={(v) => set("metadataText", v)}
            invalid={metadataInvalid}
          />
        </Field>
      </AdvancedCollapse>
    </div>
  );
}
