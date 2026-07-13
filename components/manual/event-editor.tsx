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
  isoToLocalInput,
  localInputToIso,
  parseMetadata,
  stringifyMetadata,
  suggestSlug,
} from "@/lib/manual/helpers";
import type { EventPayload } from "@/lib/types";

import { SeriesSearchSelect } from "./series-search-select";
import { TagSearchSelect } from "./tag-search-select";

export type EventEditorState = Omit<EventPayload, "metadata" | "end_date"> & {
  metadataText: string;
  start_date_local: string;
  end_date_local: string;
  deploying_timestamp_local: string;
  // Not in EventPayload (cannot be set at creation time) but kept as local
  // editor state so the form can display/prefill from existing event data.
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  restricted?: boolean;
  neg_risk?: boolean;
  neg_risk_market_id?: string;
  comment_count?: number;
};

export function emptyEventEditorState(): EventEditorState {
  return {
    slug: "",
    title: "",
    ticker: "",
    description: "",
    resolution_source: "",
    icon: "",
    active: undefined,
    closed: undefined,
    archived: undefined,
    restricted: undefined,
    neg_risk: undefined,
    neg_risk_market_id: "",
    parent_event_id: undefined,
    comment_count: undefined,
    series_id: undefined,
    series_external_id: "",
    metadata_type: "",
    metadataText: "",
    start_date_local: "",
    end_date_local: "",
    deploying_timestamp_local: "",
    tag_ids: [],
  };
}

export function eventEditorStateFromPayload(p: EventPayload): EventEditorState {
  return {
    ...p,
    ticker: p.ticker ?? "",
    description: p.description ?? "",
    resolution_source: p.resolution_source ?? "",
    icon: p.icon ?? "",
    neg_risk_market_id: "",
    series_external_id: p.series_external_id ?? "",
    metadata_type: p.metadata_type ?? "",
    metadataText: stringifyMetadata(p.metadata),
    start_date_local: "",
    end_date_local: isoToLocalInput(p.end_date),
    deploying_timestamp_local: "",
    tag_ids: p.tag_ids ?? [],
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
    parent_event_id: s.parent_event_id,
    series_id: s.series_id,
    series_external_id: cleanString(s.series_external_id),
    metadata_type: cleanString(s.metadata_type),
    metadata: parseMetadata(s.metadataText),
    end_date: localInputToIso(s.end_date_local),
    tag_ids: s.tag_ids?.length ? s.tag_ids : undefined,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Start date" htmlFor={`${idPrefix}-start`}>
          <input
            id={`${idPrefix}-start`}
            type="datetime-local"
            className={inputClass}
            value={value.start_date_local}
            onChange={(e) => set("start_date_local", e.target.value)}
          />
        </Field>
        <Field label="End date" htmlFor={`${idPrefix}-end`}>
          <input
            id={`${idPrefix}-end`}
            type="datetime-local"
            className={inputClass}
            value={value.end_date_local}
            onChange={(e) => set("end_date_local", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            valueIds={value.tag_ids ?? []}
            onChange={(ids) => set("tag_ids", ids)}
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <Field label="Neg risk">
            <BoolSelect
              value={value.neg_risk}
              onChange={(v) => set("neg_risk", v)}
            />
          </Field>
        </div>

        <Field
          label="Neg-risk market ID"
          htmlFor={`${idPrefix}-neg-risk-market-id`}
        >
          <input
            id={`${idPrefix}-neg-risk-market-id`}
            className={inputClass}
            value={value.neg_risk_market_id ?? ""}
            onChange={(e) => set("neg_risk_market_id", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Deploying timestamp"
            htmlFor={`${idPrefix}-deploying-timestamp`}
          >
            <input
              id={`${idPrefix}-deploying-timestamp`}
              type="datetime-local"
              className={inputClass}
              value={value.deploying_timestamp_local}
              onChange={(e) =>
                set("deploying_timestamp_local", e.target.value)
              }
            />
          </Field>
          <Field
            label="Parent event ID"
            htmlFor={`${idPrefix}-parent-event-id`}
          >
            <input
              id={`${idPrefix}-parent-event-id`}
              type="number"
              className={inputClass}
              value={value.parent_event_id ?? ""}
              onChange={(e) =>
                set(
                  "parent_event_id",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </Field>
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
        </div>

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
