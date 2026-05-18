"use client";

import {
  AdvancedCollapse,
  BoolSelect,
  Field,
  JsonField,
  inputClass,
  selectClass,
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
  | "metadata"
  | "start_date"
  | "end_date"
  | "accepting_orders_timestamp"
  | "event_id"
  | "event_external_id"
> & {
  metadataText: string;
  start_date_local: string;
  end_date_local: string;
  accepting_orders_timestamp_local: string;
};

export function emptyMarketEditorState(): MarketEditorState {
  return {
    question: "",
    slug: "",
    description: "",
    resolution_source: "",
    active: undefined,
    closed: undefined,
    archived: undefined,
    restricted: undefined,
    accepting_orders: undefined,
    funded: undefined,
    approved: undefined,
    activation: undefined,
    automatically_active: undefined,
    clear_book_on_start: undefined,
    rfq_enabled: undefined,
    neg_risk: undefined,
    neg_risk_market_id: "",
    neg_risk_request_id: "",
    neg_risk_other: undefined,
    order_price_min_tick_size: "",
    order_min_size: undefined,
    uma_bond: "",
    uma_reward: "",
    liveness: "",
    metadata_type: "",
    metadataText: "",
    start_date_local: "",
    end_date_local: "",
    accepting_orders_timestamp_local: "",
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
    neg_risk_market_id: p.neg_risk_market_id ?? "",
    neg_risk_request_id: p.neg_risk_request_id ?? "",
    order_price_min_tick_size: p.order_price_min_tick_size ?? "",
    uma_bond: p.uma_bond ?? "",
    uma_reward: p.uma_reward ?? "",
    liveness: p.liveness ?? "",
    metadata_type: p.metadata_type ?? "",
    metadataText: stringifyMetadata(p.metadata),
    start_date_local: isoToLocalInput(p.start_date),
    end_date_local: isoToLocalInput(p.end_date),
    accepting_orders_timestamp_local: isoToLocalInput(
      p.accepting_orders_timestamp,
    ),
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
    active: s.active,
    closed: s.closed,
    archived: s.archived,
    restricted: s.restricted,
    accepting_orders: s.accepting_orders,
    funded: s.funded,
    approved: s.approved,
    activation: s.activation,
    automatically_active: s.automatically_active,
    clear_book_on_start: s.clear_book_on_start,
    rfq_enabled: s.rfq_enabled,
    neg_risk: s.neg_risk,
    neg_risk_market_id: cleanString(s.neg_risk_market_id),
    neg_risk_request_id: cleanString(s.neg_risk_request_id),
    neg_risk_other: s.neg_risk_other,
    order_price_min_tick_size: cleanString(s.order_price_min_tick_size),
    order_min_size: s.order_min_size,
    uma_bond: cleanString(s.uma_bond),
    uma_reward: cleanString(s.uma_reward),
    liveness: cleanString(s.liveness),
    metadata_type: cleanString(s.metadata_type),
    metadata: parseMetadata(s.metadataText),
    start_date: localInputToIso(s.start_date_local),
    end_date: localInputToIso(s.end_date_local),
    accepting_orders_timestamp: localInputToIso(
      s.accepting_orders_timestamp_local,
    ),
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Active">
          <BoolSelect value={value.active} onChange={(v) => set("active", v)} />
        </Field>
        <Field label="Accepting orders">
          <BoolSelect
            value={value.accepting_orders}
            onChange={(v) => set("accepting_orders", v)}
          />
        </Field>
        <Field label="Activation" htmlFor={`${idPrefix}-activation`}>
          <select
            id={`${idPrefix}-activation`}
            className={selectClass}
            value={value.activation ?? ""}
            onChange={(e) =>
              set(
                "activation",
                e.target.value === ""
                  ? undefined
                  : (e.target.value as MarketEditorState["activation"]),
              )
            }
          >
            <option value="">— default (AUTO) —</option>
            <option value="AUTO">AUTO</option>
            <option value="MANUAL">MANUAL</option>
          </select>
        </Field>
        <Field label="Funded">
          <BoolSelect value={value.funded} onChange={(v) => set("funded", v)} />
        </Field>
      </div>

      <AdvancedCollapse>
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
          <Field label="Approved">
            <BoolSelect
              value={value.approved}
              onChange={(v) => set("approved", v)}
            />
          </Field>
          <Field label="Automatically active">
            <BoolSelect
              value={value.automatically_active}
              onChange={(v) => set("automatically_active", v)}
            />
          </Field>
          <Field label="Clear book on start">
            <BoolSelect
              value={value.clear_book_on_start}
              onChange={(v) => set("clear_book_on_start", v)}
            />
          </Field>
          <Field label="RFQ enabled">
            <BoolSelect
              value={value.rfq_enabled}
              onChange={(v) => set("rfq_enabled", v)}
            />
          </Field>
          <Field label="Neg risk">
            <BoolSelect
              value={value.neg_risk}
              onChange={(v) => set("neg_risk", v)}
            />
          </Field>
          <Field label="Neg risk other">
            <BoolSelect
              value={value.neg_risk_other}
              onChange={(v) => set("neg_risk_other", v)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Neg-risk market ID"
            htmlFor={`${idPrefix}-nr-market-id`}
          >
            <input
              id={`${idPrefix}-nr-market-id`}
              className={inputClass}
              value={value.neg_risk_market_id ?? ""}
              onChange={(e) => set("neg_risk_market_id", e.target.value)}
            />
          </Field>
          <Field
            label="Neg-risk request ID"
            htmlFor={`${idPrefix}-nr-request-id`}
          >
            <input
              id={`${idPrefix}-nr-request-id`}
              className={inputClass}
              value={value.neg_risk_request_id ?? ""}
              onChange={(e) => set("neg_risk_request_id", e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Accepting-orders timestamp"
          htmlFor={`${idPrefix}-aot`}
        >
          <input
            id={`${idPrefix}-aot`}
            type="datetime-local"
            className={inputClass}
            value={value.accepting_orders_timestamp_local}
            onChange={(e) =>
              set("accepting_orders_timestamp_local", e.target.value)
            }
          />
        </Field>

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
