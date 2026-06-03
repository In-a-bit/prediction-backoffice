"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  Card,
  CardBody,
  CardHeader,
  ErrorMessage,
  Field,
  buttonVariants,
} from "@/components/ui";
import { TagChipsEditor, suggestSoccerTags } from "@/components/sports/tag-chips";
import type { SportTask, SportsTagSpec } from "@/lib/types";

// EditSportTaskForm edits the mutable parts of a league config:
// time_ahead_hours, tags, category, sub-category, and the four toggles.
// Sport, api_league_id, api_season, league_slug, series_id are immutable
// after creation — they define the config's identity.
export function EditSportTaskForm({ config }: { config: SportTask }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initial tag state: we only have numeric tag_ids from the existing
  // config — slugs/labels aren't stored locally. We seed the chip editor
  // with the soccer suggestion set (operator can clear) and operators can
  // add more by typing labels. On submit, the backend upserts each chip's
  // slug and replaces tag_ids with the merged result.
  const initialTags = suggestSoccerTags({
    leagueName: String(config.league_metadata?.name ?? config.league_slug),
    country: String(config.league_metadata?.country ?? ""),
    season: config.api_season,
  });
  const [tags, setTags] = useState<SportsTagSpec[]>(initialTags);

  const [timeAheadHours, setTimeAheadHours] = useState<number>(config.time_ahead_hours);
  const [liveness, setLiveness] = useState<string>(
    config.liveness !== undefined ? String(config.liveness) : "",
  );
  const [category, setCategory] = useState<string>(config.category ?? "");
  const [subCategory, setSubCategory] = useState<string>(config.sub_category ?? "");
  const [isCreateActive, setIsCreateActive] = useState<boolean>(config.is_create_active);
  const [isResolveActive, setIsResolveActive] = useState<boolean>(config.is_resolve_active);
  const [isMetadataUpdateActive, setIsMetadataUpdateActive] = useState<boolean>(
    config.is_metadata_update_active,
  );
  const [autoStartPlans, setAutoStartPlans] = useState<boolean>(config.auto_start_plans);

  const canSubmit = timeAheadHours > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    setSubmitError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sports/tasks/${config.id}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            time_ahead_hours: timeAheadHours,
            tag_specs: tags,
            category: category || "",
            sub_category: subCategory || "",
            is_create_active: isCreateActive,
            is_resolve_active: isResolveActive,
            is_metadata_update_active: isMetadataUpdateActive,
            auto_start_plans: autoStartPlans,
            ...(liveness !== ""
              ? { liveness: parseInt(liveness, 10) }
              : config.liveness !== undefined
                ? { clear_liveness: true }
                : {}),
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setSubmitError(`status ${res.status}: ${text}`);
          return;
        }
        router.push(`/automations/sports/soccer/${config.id}`);
        router.refresh();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <span className="font-semibold">Operational config</span>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field
            label="Time ahead (hours)"
            hint="How far in advance of kickoff to create fixture events + markets."
          >
            <input
              type="number"
              className="border rounded px-3 py-2 w-32"
              value={timeAheadHours}
              onChange={(e) => setTimeAheadHours(parseInt(e.target.value || "0", 10))}
            />
          </Field>

          <Field
            label="UMA liveness"
            hint="How long (in seconds) UMA's Optimistic Oracle waits before a proposal can be resolved. Clear the field to revert to the global default (7200 s = 2 h)."
          >
            <input
              type="number"
              className="border rounded px-3 py-2 w-40"
              placeholder="7200 (global default)"
              value={liveness}
              min={1}
              onChange={(e) => setLiveness(e.target.value)}
            />
          </Field>

          <Field
            label="Tags"
            hint="Unknown slugs are created in dpm-api on save; existing ones are reused. Replaces the current tag list on the config."
          >
            <TagChipsEditor value={tags} onChange={setTags} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input
                className="border rounded px-3 py-2 w-full"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>
            <Field label="Sub-category">
              <input
                className="border rounded px-3 py-2 w-full"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="font-semibold">Toggles</span>
        </CardHeader>
        <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ToggleRow
            label="Create active"
            note="When off, no new fixture_events are ingested. In-flight markets continue."
            value={isCreateActive}
            onChange={setIsCreateActive}
          />
          <ToggleRow
            label="Resolve active"
            note="When off, decisions stop being written. Already-written decisions keep dispatching."
            value={isResolveActive}
            onChange={setIsResolveActive}
          />
          <ToggleRow
            label="Metadata updates"
            note="When off, no PATCH calls are sent even if team stats change."
            value={isMetadataUpdateActive}
            onChange={setIsMetadataUpdateActive}
          />
          <ToggleRow
            label="Auto-start plans"
            note="When off, new DeployPlans start paused — operator must click Start."
            value={autoStartPlans}
            onChange={setAutoStartPlans}
          />
        </CardBody>
      </Card>

      {submitError && <ErrorMessage>{submitError}</ErrorMessage>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isPending}
          className={buttonVariants.primary}
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-foreground-muted">{note}</div>
      </div>
    </label>
  );
}
