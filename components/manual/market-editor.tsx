"use client";

import { useEffect, useState } from "react";

import {
  AdvancedCollapse,
  Field,
  JsonField,
  UsdcAmountInput,
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
import { usdcInputToRaw, usdcRawToInput } from "@/lib/format";
import type { ManualMarketConfig, MarketPayload } from "@/lib/types";

export type MarketEditorState = Omit<
  MarketPayload,
  | "metadata"
  | "end_date"
  | "event_id"
  | "event_external_id"
  | "uma_bond"
  | "uma_reward"
> & {
  metadataText: string;
  end_date_local: string;
  // Editable USDC decimal text (2dp, e.g. "5.00"), converted to/from the
  // raw 6-decimal uma_bond/uma_reward wire strings only at the payload
  // boundary below — mirrors the end_date_local <-> end_date ISO pattern.
  uma_bond_usdc: string;
  uma_reward_usdc: string;
};

export function emptyMarketEditorState(): MarketEditorState {
  return {
    question: "",
    slug: "",
    description: "",
    resolution_source: "",
    order_price_min_tick_size: "",
    order_min_size: undefined,
    uma_bond_usdc: "",
    uma_reward_usdc: "",
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
    uma_bond_usdc: usdcRawToInput(p.uma_bond),
    uma_reward_usdc: usdcRawToInput(p.uma_reward),
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
    uma_bond: usdcInputToRaw(s.uma_bond_usdc) || undefined,
    uma_reward: usdcInputToRaw(s.uma_reward_usdc) || undefined,
    liveness: cleanString(s.liveness),
    metadata_type: cleanString(s.metadata_type),
    metadata: parseMetadata(s.metadataText),
    end_date: localInputToIso(s.end_date_local),
  };
}

// marketUmaAmountError validates a UMA bond/reward USDC input against the
// fetched config's min/max (raw, 6-decimal strings; min is hardcoded
// server-side and always enforced by CreateMarket regardless of the UI).
// Blank input means "use the server default" and is always valid — the
// operator isn't required to override it.
function marketUmaAmountError(
  usdcText: string,
  minRaw: string | undefined,
  maxRaw: string | undefined,
): string | undefined {
  const raw = usdcInputToRaw(usdcText);
  if (raw === null) return "Enter a non-negative amount (up to 2 decimals)";
  if (raw === "") return undefined;
  if (minRaw !== undefined && BigInt(raw) < BigInt(minRaw)) {
    return `Min is ${usdcRawToInput(minRaw)} USDC`;
  }
  if (maxRaw !== undefined && BigInt(raw) > BigInt(maxRaw)) {
    return `Max is ${usdcRawToInput(maxRaw)} USDC`;
  }
  return undefined;
}

// marketEditorHasBlockingErrors lets the parent forms gate their submit
// buttons — an operator-entered UMA bond/reward outside the configured
// min/max (or otherwise unparsable) must be fixed before create. Returns
// false while `config` hasn't loaded yet: the bounds are unknown at that
// point, and blocking on a slow network would look identical to a
// validation failure.
export function marketEditorHasBlockingErrors(
  state: MarketEditorState,
  config: ManualMarketConfig | null,
): boolean {
  if (!config) return false;
  return (
    Boolean(
      marketUmaAmountError(
        state.uma_bond_usdc,
        config.uma_bond_min,
        config.uma_bond_max,
      ),
    ) ||
    Boolean(
      marketUmaAmountError(
        state.uma_reward_usdc,
        config.uma_reward_min,
        config.uma_reward_max,
      ),
    )
  );
}

let manualMarketConfigPromise: Promise<ManualMarketConfig | null> | null =
  null;

// useManualMarketConfig fetches GET /api/manual/markets/config once and
// shares the result (and the in-flight promise) across every MarketEditor
// instance — and every parent form's own call to this hook — on the page.
// The config is process-wide (env vars), never changes per request, so
// there's no reason for each draft row to issue its own fetch.
export function useManualMarketConfig(): ManualMarketConfig | null {
  const [config, setConfig] = useState<ManualMarketConfig | null>(null);

  useEffect(() => {
    if (!manualMarketConfigPromise) {
      manualMarketConfigPromise = fetch("/api/manual/markets/config")
        .then((res) => {
          if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
          return res.json() as Promise<ManualMarketConfig>;
        })
        .catch(() => null);
    }
    let cancelled = false;
    manualMarketConfigPromise.then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
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

  const config = useManualMarketConfig();
  const bondError = marketUmaAmountError(
    value.uma_bond_usdc,
    config?.uma_bond_min,
    config?.uma_bond_max,
  );
  const rewardError = marketUmaAmountError(
    value.uma_reward_usdc,
    config?.uma_reward_min,
    config?.uma_reward_max,
  );
  const bondHint =
    !bondError && config
      ? `Default ${usdcRawToInput(config.uma_bond_default)} USDC · Min ${usdcRawToInput(config.uma_bond_min)} USDC · Max ${usdcRawToInput(config.uma_bond_max)} USDC`
      : undefined;
  const rewardHint =
    !rewardError && config
      ? `Default ${usdcRawToInput(config.uma_reward_default)} USDC · Min ${usdcRawToInput(config.uma_reward_min)} USDC · Max ${usdcRawToInput(config.uma_reward_max)} USDC`
      : undefined;

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
            hint={bondHint}
            error={bondError}
            htmlFor={`${idPrefix}-uma-bond`}
          >
            <UsdcAmountInput
              id={`${idPrefix}-uma-bond`}
              value={value.uma_bond_usdc}
              onChange={(v) => set("uma_bond_usdc", v)}
              invalid={Boolean(bondError)}
              placeholder={
                config ? usdcRawToInput(config.uma_bond_default) : "0.00"
              }
            />
          </Field>
          <Field
            label="UMA reward"
            hint={rewardHint}
            error={rewardError}
            htmlFor={`${idPrefix}-uma-reward`}
          >
            <UsdcAmountInput
              id={`${idPrefix}-uma-reward`}
              value={value.uma_reward_usdc}
              onChange={(v) => set("uma_reward_usdc", v)}
              invalid={Boolean(rewardError)}
              placeholder={
                config ? usdcRawToInput(config.uma_reward_default) : "0.00"
              }
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
