// Pure formatting helpers used by both server and client components.

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const DATE_FMT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_FMT_FULL = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return DATE_FMT.format(d);
}

export function formatDateTimeFull(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return DATE_FMT_FULL.format(d);
}

export function formatRelative(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(diffMs / 60_000);
  const hr = Math.round(diffMs / 3_600_000);
  const day = Math.round(diffMs / 86_400_000);
  if (absMs < 60_000) return RTF.format(sec, "second");
  if (absMs < 3_600_000) return RTF.format(min, "minute");
  if (absMs < 86_400_000) return RTF.format(hr, "hour");
  return RTF.format(day, "day");
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days}d`;
  }
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

export function formatPrice(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number(value);
  if (!isFinite(n)) return value;
  if (n >= 1000) return n.toLocaleString("en", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en", { maximumFractionDigits: 4 });
  return n.toLocaleString("en", { maximumFractionDigits: 8 });
}

export function shortId(uuid: string | null | undefined): string {
  if (!uuid) return "—";
  return uuid.slice(0, 8);
}
