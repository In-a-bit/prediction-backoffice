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
import type { MarketPayload } from "@/lib/types";

export type MarketEditorState = Omit<
  MarketPayload,
  "metadata" | "end_date" | "event_id" | "event_external_id"
> & {
  metadataText: string;
  end_date_local: string;
};

export function emptyMarketEditorState(): MarketEditorState {
  return {
    question: "",
    slug: "",
    description: "",
    resolution_source: "",
    order_price_min_tick_size: "",
    order_min_size: undefined,
    uma_bond: "",
    uma_reward: "",
    liveness: "",
    metadata_type: "",
    metadataText: "",
    end_date_local: "",
  };
}

export function marketEditorStateFromPayload(
  p: MarketPayload,
): MarketEditorState {
  return {
    ...p,
    slug: p.slug ?? "",
    description: p.description ?? "",
    resolution_source: p.resolution_source ?? "",
    order_price_min_tick_size: p.order_price_min_tick_size ?? "",
    uma_bond: p.uma_bond ?? "",
    uma_reward: p.uma_reward ?? "",
    liveness: p.liveness ?? "",
    metadata_type: p.metadata_type ?? "",
    metadataText: stringifyMetadata(p.metadata),
    end_date_local: isoToLocalInput(p.end_date),
  };
}

export function marketEditorStateToPayload(
  s: MarketEditorState,
  eventLink: { event_id?: number; event_external_id?: string },
): MarketPayload {
  const cleanString = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return {
    event_id: eventLink.event_id,
    event_external_id: eventLink.event_external_id,
    question: s.question.trim(),
    slug: cleanString(s.slug),
    description: cleanString(s.description),
    resolution_source: cleanString(s.resolution_source),
    order_price_min_tick_size: cleanString(s.order_price_min_tick_size),
    order_min_size: s.order_min_size,
    uma_bond: cleanString(s.uma_bond),
    uma_reward: cleanString(s.uma_reward),
    liveness: cleanString(s.liveness),
    metadata_type: cleanString(s.metadata_type),
    metadata: parseMetadata(s.metadataText),
    end_date: localInputToIso(s.end_date_local),
  };
}

export function MarketEditor({
  value,
  onChange,
  idPrefix = "market",
}: {
  value: MarketEditorState;
  onChange: (next: MarketEditorState) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof MarketEditorState>(
    key: K,
    v: MarketEditorState[K],
  ) => onChange({ ...value, [key]: v });

  const metadataInvalid =
    value.metadataText.trim() !== "" && !isMetadataValid(value.metadataText);

  return (
    <div className="space-y-4">
      <Field label="Question" required htmlFor={`${idPrefix}-question`}>
        <input
          id={`${idPrefix}-question`}
          className={inputClass}
          value={value.question}
          onChange={(e) => {
            const next = e.target.value;
            const shouldFillSlug =
              !value.slug || value.slug === suggestSlug(value.question);
            onChange({
              ...value,
              question: next,
              slug: shouldFillSlug ? suggestSlug(next) : value.slug,
            });
          }}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Slug" htmlFor={`${idPrefix}-slug`}>
          <input
            id={`${idPrefix}-slug`}
            className={inputClass}
            value={value.slug ?? ""}
            onChange={(e) => set("slug", e.target.value)}
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

      <Field label="End date" htmlFor={`${idPrefix}-end`}>
        <input
          id={`${idPrefix}-end`}
          type="datetime-local"
          className={inputClass}
          value={value.end_date_local}
          onChange={(e) => set("end_date_local", e.target.value)}
        />
      </Field>

      <AdvancedCollapse>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Order price min tick size"
            hint="Decimal string (e.g. 0.01)"
            htmlFor={`${idPrefix}-tick`}
          >
            <input
              id={`${idPrefix}-tick`}
              className={inputClass}
              value={value.order_price_min_tick_size ?? ""}
              onChange={(e) =>
                set("order_price_min_tick_size", e.target.value)
              }
            />
          </Field>
          <Field label="Order min size" htmlFor={`${idPrefix}-min-size`}>
            <input
              id={`${idPrefix}-min-size`}
              type="number"
              min={0}
              className={inputClass}
              value={value.order_min_size ?? ""}
              onChange={(e) =>
                set(
                  "order_min_size",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="UMA bond"
            hint="Integer string in wei"
            htmlFor={`${idPrefix}-uma-bond`}
          >
            <input
              id={`${idPrefix}-uma-bond`}
              className={inputClass}
              value={value.uma_bond ?? ""}
              onChange={(e) => set("uma_bond", e.target.value)}
            />
          </Field>
          <Field
            label="UMA reward"
            hint="Integer string in wei"
            htmlFor={`${idPrefix}-uma-reward`}
          >
            <input
              id={`${idPrefix}-uma-reward`}
              className={inputClass}
              value={value.uma_reward ?? ""}
              onChange={(e) => set("uma_reward", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Liveness"
            hint="Seconds (default 7200)"
            htmlFor={`${idPrefix}-liveness`}
          >
            <input
              id={`${idPrefix}-liveness`}
              className={inputClass}
              value={value.liveness ?? ""}
              onChange={(e) => set("liveness", e.target.value)}
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
