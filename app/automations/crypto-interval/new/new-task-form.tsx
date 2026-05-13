"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { ErrorMessage, buttonVariants } from "@/components/ui";
import { createTaskAction } from "@/lib/actions";
import { formatDateTimeFull, formatDuration, formatRelative } from "@/lib/format";
import type { Asset, Interval } from "@/lib/types";

const TIME_AHEAD_OPTIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "12 hours", minutes: 720 },
  { label: "24 hours", minutes: 1440 },
  { label: "48 hours", minutes: 2880 },
];

// Mirrors backend marketplan.NextSlotEnd: round `at` up to the next multiple
// of `intervalMinutes` since the unix epoch, in UTC. If `at` already lies on
// a boundary the same instant is returned.
function nextSlotEnd(at: Date, intervalMinutes: number): Date {
  const stepMs = intervalMinutes * 60_000;
  const ms = at.getTime();
  const rem = ms % stepMs;
  if (rem === 0) return new Date(ms);
  return new Date(ms + (stepMs - rem));
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewTaskForm({
  assets,
  intervals,
}: {
  assets: Asset[];
  intervals: Interval[];
}) {
  const sortedIntervals = useMemo(
    () => [...intervals].sort((a, b) => a.minutes - b.minutes),
    [intervals],
  );
  const [assetId, setAssetId] = useState<string>(
    assets[0]?.id.toString() ?? "",
  );
  const [intervalId, setIntervalId] = useState<string>(
    sortedIntervals[0]?.id.toString() ?? "",
  );
  const [timeAhead, setTimeAhead] = useState<number>(1440);
  const [firstMarketMode, setFirstMarketMode] = useState<"auto" | "custom">(
    "auto",
  );
  const [customFirstMarket, setCustomFirstMarket] = useState<string>("");
  const [isCreateActive, setIsCreateActive] = useState(true);
  const [isResolveActive, setIsResolveActive] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const intervalMinutes = useMemo(() => {
    const iv = sortedIntervals.find((x) => x.id.toString() === intervalId);
    return iv?.minutes ?? 0;
  }, [sortedIntervals, intervalId]);

  const autoPreview = useMemo(() => {
    if (!intervalMinutes) return null;
    return nextSlotEnd(now, intervalMinutes);
  }, [now, intervalMinutes]);

  const customPreview = useMemo(() => {
    if (!intervalMinutes || !customFirstMarket) return null;
    const picked = new Date(customFirstMarket);
    if (isNaN(picked.getTime())) return null;
    return nextSlotEnd(picked, intervalMinutes);
  }, [customFirstMarket, intervalMinutes]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const a = Number(assetId);
    const iv = Number(intervalId);
    if (!a || !iv || !timeAhead) {
      setError("Please choose an asset, interval, and time ahead.");
      return;
    }

    let firstMarketAt: string | undefined;
    if (firstMarketMode === "custom") {
      if (!customFirstMarket) {
        setError("Pick a date/time for the first market, or switch to Automatic.");
        return;
      }
      const picked = new Date(customFirstMarket);
      if (isNaN(picked.getTime())) {
        setError("Invalid first market date/time.");
        return;
      }
      if (picked.getTime() <= now.getTime()) {
        setError("First market time must be in the future.");
        return;
      }
      firstMarketAt = picked.toISOString();
    }

    startTransition(async () => {
      const res = await createTaskAction({
        asset_id: a,
        interval_id: iv,
        time_ahead_minutes: timeAhead,
        first_market_at: firstMarketAt,
        is_create_active: isCreateActive,
        is_resolve_active: isResolveActive,
      });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      <Field
        label="Asset"
        hint="Asset must already exist and be active. Add new ones from the Assets page."
      >
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className={selectClass}
        >
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_name}/{a.target.toUpperCase()} ({a.source_base}
              {a.source_target})
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Interval"
        hint="Duration of each individual market. Slots are aligned to the interval boundary."
      >
        <div className="flex flex-wrap gap-2">
          {sortedIntervals.map((iv) => (
            <PillRadio
              key={iv.id}
              name="interval"
              value={iv.id.toString()}
              checked={intervalId === iv.id.toString()}
              onChange={setIntervalId}
              label={iv.label}
            />
          ))}
        </div>
      </Field>

      <Field
        label="Time ahead"
        hint="How far in advance to keep markets created. The create loop will continuously fill the gap up to this horizon."
      >
        <div className="flex flex-wrap gap-2">
          {TIME_AHEAD_OPTIONS.map((opt) => (
            <PillRadio
              key={opt.minutes}
              name="time_ahead"
              value={opt.minutes.toString()}
              checked={timeAhead === opt.minutes}
              onChange={(v) => setTimeAhead(Number(v))}
              label={opt.label}
            />
          ))}
        </div>
        <p className="text-xs text-foreground-muted mt-2">
          Selected: {formatDuration(timeAhead)}
        </p>
      </Field>

      <Field
        label="First market at"
        hint="End time of the very first market. Auto picks the next aligned slot end after now. A custom time will be snapped UP to the next interval boundary (e.g. 5m → :00/:05/...)."
      >
        <div className="flex flex-wrap gap-2 mb-2">
          <PillRadio
            name="first_market_mode"
            value="auto"
            checked={firstMarketMode === "auto"}
            onChange={(v) => setFirstMarketMode(v as "auto" | "custom")}
            label="Automatic"
          />
          <PillRadio
            name="first_market_mode"
            value="custom"
            checked={firstMarketMode === "custom"}
            onChange={(v) => setFirstMarketMode(v as "auto" | "custom")}
            label="Custom"
          />
        </div>

        {firstMarketMode === "custom" ? (
          <div className="space-y-2">
            <input
              type="datetime-local"
              value={customFirstMarket}
              min={toDatetimeLocal(now)}
              onChange={(e) => setCustomFirstMarket(e.target.value)}
              className={selectClass}
            />
            <FirstMarketPreview value={customPreview} now={now} />
          </div>
        ) : (
          <FirstMarketPreview value={autoPreview} now={now} />
        )}
      </Field>

      <Field label="Initial state">
        <div className="flex flex-col gap-2">
          <Checkbox
            checked={isCreateActive}
            onChange={setIsCreateActive}
            label="Create active"
            hint="Create loop will fill missing market slots."
          />
          <Checkbox
            checked={isResolveActive}
            onChange={setIsResolveActive}
            label="Resolve active"
            hint="Resolve loop will report payouts for ended markets."
          />
        </div>
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className={buttonVariants.primary}
        >
          {pending ? "Creating…" : "Create task"}
        </button>
        <Link href="/automations/crypto-interval" className={buttonVariants.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

const selectClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1.5">{label}</div>
      {children}
      {hint ? (
        <div className="text-xs text-foreground-muted mt-1.5">{hint}</div>
      ) : null}
    </label>
  );
}

function PillRadio({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label
      className={`cursor-pointer rounded-full px-3 py-1.5 text-sm border transition-colors ${
        checked
          ? "bg-accent text-accent-foreground border-accent"
          : "border-border hover:bg-foreground/5"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function FirstMarketPreview({
  value,
  now,
}: {
  value: Date | null;
  now: Date;
}) {
  if (!value) {
    return (
      <p className="text-xs text-foreground-muted">
        Select an interval first to preview the resolved time.
      </p>
    );
  }
  return (
    <p className="text-xs text-foreground-muted">
      Resolved:{" "}
      <span className="text-foreground font-medium">
        {formatDateTimeFull(value)}
      </span>{" "}
      ({formatRelative(value, now)})
    </p>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-accent"
      />
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs text-foreground-muted">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
