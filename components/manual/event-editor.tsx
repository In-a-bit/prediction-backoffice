"use client";

import {
  AdvancedCollapse,
  Field,
  JsonField,
  inputClass,
} from "@/components/ui";
import {
  isMetadataValid,
  isoToLocalInput,
  localInputToIso,
  parseMetadata,
  stringifyMetadata,
  suggestSlug,
} from "@/lib/manual/helpers";
import { mergeTagDrafts } from "@/lib/manual/tags";
import type { EventPayload, EventTagDraft } from "@/lib/types";

import { SeriesSearchSelect } from "./series-search-select";
import { TagSearchSelect } from "./tag-search-select";

export type EventEditorState = Omit<
  EventPayload,
  "metadata" | "end_date" | "tag_ids"
> & {
  metadataText: string;
  // Tags are edited as {slug,label} drafts, not resolved ids: an operator can
  // add a tag that does not exist in dpm-api yet. The submitting form calls
  // resolveTagIds(state.tags) and stamps the resulting ids onto the payload.
  tags: EventTagDraft[];
  end_date_local: string;
};

export function emptyEventEditorState(): EventEditorState {
  return {
    slug: "",
    title: "",
    ticker: "",
    description: "",
    resolution_source: "",
    icon: "",
    series_id: undefined,
    series_external_id: "",
    metadata_type: "",
    metadataText: "",
    end_date_local: "",
    tags: [],
  };
}

// `tags` is passed separately because EventPayload only carries resolved
// numeric tag_ids, which are useless for display. Callers that have the
// {slug,label} list (AI drafts, the slug adapter, an existing event's tags)
// hand it in here.
export function eventEditorStateFromPayload(
  p: EventPayload,
  tags: EventTagDraft[] = [],
): EventEditorState {
  // tag_ids are dropped: the editor's tag source of truth is the `tags` draft
  // list, and carrying a stale id list alongside it is how the two used to
  // diverge (the resolved list silently overwrote the operator's picks).
  const rest: EventPayload = { ...p };
  delete rest.tag_ids;
  return {
    ...rest,
    ticker: p.ticker ?? "",
    description: p.description ?? "",
    resolution_source: p.resolution_source ?? "",
    icon: p.icon ?? "",
    series_external_id: p.series_external_id ?? "",
    metadata_type: p.metadata_type ?? "",
    metadataText: stringifyMetadata(p.metadata),
    end_date_local: isoToLocalInput(p.end_date),
    tags: mergeTagDrafts(tags),
  };
}

export function eventEditorStateToPayload(s: EventEditorState): EventPayload {
  const cleanString = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return {
    slug: s.slug.trim(),
    title: s.title.trim(),
    ticker: cleanString(s.ticker),
    description: cleanString(s.description),
    resolution_source: cleanString(s.resolution_source),
    icon: cleanString(s.icon),
    series_id: s.series_id,
    series_external_id: cleanString(s.series_external_id),
    metadata_type: cleanString(s.metadata_type),
    metadata: parseMetadata(s.metadataText),
    end_date: localInputToIso(s.end_date_local),
    // tag_ids are resolved asynchronously by the caller (resolveTagIds) and
    // stamped onto the returned payload — this conversion is synchronous.
  };
}

export function EventEditor({
  value,
  onChange,
  idPrefix = "event",
}: {
  value: EventEditorState;
  onChange: (next: EventEditorState) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof EventEditorState>(
    key: K,
    v: EventEditorState[K],
  ) => onChange({ ...value, [key]: v });

  const metadataInvalid =
    value.metadataText.trim() !== "" && !isMetadataValid(value.metadataText);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title" required htmlFor={`${idPrefix}-title`}>
          <input
            id={`${idPrefix}-title`}
            className={inputClass}
            value={value.title}
            onChange={(e) => {
              const next = e.target.value;
              const shouldFillSlug =
                !value.slug || value.slug === suggestSlug(value.title);
              onChange({
                ...value,
                title: next,
                slug: shouldFillSlug ? suggestSlug(next) : value.slug,
              });
            }}
          />
        </Field>
        <Field label="Slug" required htmlFor={`${idPrefix}-slug`}>
          <input
            id={`${idPrefix}-slug`}
            className={inputClass}
            value={value.slug}
            onChange={(e) => set("slug", e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor={`${idPrefix}-description`}
        hint="Markdown-friendly. Operators see this verbatim on the event detail page — keep it specific so the rationale isn't lost when the market resolves weeks later."
      >
        <textarea
          id={`${idPrefix}-description`}
          className={`${inputClass} min-h-[10rem] leading-relaxed`}
          rows={8}
          value={value.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Why this market exists, what counts as YES/NO, where the resolution data comes from, edge cases…"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="End date" htmlFor={`${idPrefix}-end`}>
          <input
            id={`${idPrefix}-end`}
            type="datetime-local"
            className={inputClass}
            value={value.end_date_local}
            onChange={(e) => set("end_date_local", e.target.value)}
          />
        </Field>
        <Field label="Resolution source" htmlFor={`${idPrefix}-resource`}>
          <input
            id={`${idPrefix}-resource`}
            className={inputClass}
            placeholder="https://..."
            value={value.resolution_source ?? ""}
            onChange={(e) => set("resolution_source", e.target.value)}
          />
        </Field>
        <Field label="Ticker" htmlFor={`${idPrefix}-ticker`}>
          <input
            id={`${idPrefix}-ticker`}
            className={inputClass}
            value={value.ticker ?? ""}
            onChange={(e) => set("ticker", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Series">
          <SeriesSearchSelect
            value={value.series_external_id ?? ""}
            onChange={(externalId) => set("series_external_id", externalId)}
          />
        </Field>
        <Field label="Tags">
          <TagSearchSelect
            idPrefix={`${idPrefix}-tags`}
            value={value.tags}
            onChange={(tags) => set("tags", tags)}
          />
        </Field>
      </div>

      <AdvancedCollapse>
        <Field label="Icon URL" htmlFor={`${idPrefix}-icon`}>
          <input
            id={`${idPrefix}-icon`}
            className={inputClass}
            value={value.icon ?? ""}
            onChange={(e) => set("icon", e.target.value)}
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
