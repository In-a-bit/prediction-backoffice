"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge, Card, CardBody, CardHeader, ErrorMessage, buttonVariants } from "@/components/ui";
import type { SportTask } from "@/lib/types";

const AVAILABLE_MARKET_TYPES = [
  { key: "moneyline", label: "Moneyline" },
  { key: "halftime", label: "Halftime" },
] as const;

export function SportTaskControls({ config }: { config: SportTask }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activeMarketKeys = new Set(
    config.market_types.filter((mt) => !mt.deactivated_at).map((mt) => mt.key),
  );
  const addableKeys = AVAILABLE_MARKET_TYPES.filter((mt) => !activeMarketKeys.has(mt.key));

  const post = (path: string, body: unknown) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(path, {
          method: body === undefined ? "DELETE" : "POST",
          headers: body === undefined ? {} : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setError(`status ${res.status}: ${text}`);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const toggle = (field: "is_create_active" | "is_resolve_active" | "is_metadata_update_active", next: boolean) => {
    post(`/api/sports/tasks/${config.id}/update`, { [field]: next });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <span className="font-semibold">Toggles</span>
        </CardHeader>
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ToggleRow
            label="Create active"
            note="When off, no new fixture_events are ingested and no new DeployPlans spawned. In-flight markets continue their lifecycle."
            value={config.is_create_active}
            onChange={(v) => toggle("is_create_active", v)}
            disabled={pending}
          />
          <ToggleRow
            label="Resolve active"
            note="When off, decisions stop being written even if fixtures finish. Already-written decisions keep dispatching."
            value={config.is_resolve_active}
            onChange={(v) => toggle("is_resolve_active", v)}
            disabled={pending}
          />
          <ToggleRow
            label="Metadata updates"
            note="When off, no PATCH calls are sent to dpm-api even if team stats change."
            value={config.is_metadata_update_active}
            onChange={(v) => toggle("is_metadata_update_active", v)}
            disabled={pending}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-3">
          <span className="font-semibold">Market types</span>
          <span className="ml-auto text-xs text-foreground-muted">
            time ahead: {config.time_ahead_hours}h
          </span>
        </CardHeader>
        <CardBody className="space-y-3">
          {config.market_types
            .filter((mt) => !mt.deactivated_at)
            .map((mt) => (
              <div key={mt.id} className="flex items-center gap-3">
                <Badge tone="success">{mt.key}</Badge>
                <span className="text-sm">{mt.display_name}</span>
                <button
                  type="button"
                  className={`ml-auto ${buttonVariants.ghost}`}
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        `Remove ${mt.display_name}?\n\nAlready-created markets keep their lifecycle (propose + resolve still happen). Only future fixtures skip this behavior.`,
                      )
                    )
                      return;
                    post(`/api/sports/tasks/${config.id}/market-types/${mt.id}/remove`, undefined);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}

          {addableKeys.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs text-foreground-muted mb-2">Add more:</div>
              <div className="flex flex-wrap gap-2">
                {addableKeys.map((mt) => (
                  <button
                    key={mt.key}
                    type="button"
                    className={buttonVariants.secondary}
                    disabled={pending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Add ${mt.label}?\n\nA backfill DeployPlan will be created for every fixture in the time-ahead window that hasn't kicked off yet — they'll get the new market(s) on the next 5-minute upcoming tick.`,
                        )
                      )
                        return;
                      post(`/api/sports/tasks/${config.id}/market-types/add`, {
                        market_type_key: mt.key,
                      });
                    }}
                  >
                    + {mt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

function ToggleRow({
  label,
  note,
  value,
  onChange,
  disabled,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-foreground-muted">{note}</div>
      </div>
    </label>
  );
}
