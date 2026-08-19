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

// Words that should render as their all-caps form rather than plain title
// case when they show up in a raw DB value, e.g. a future "uma_*" local_status
// not yet covered by a display-label lookup table.
const TITLE_CASE_ACRONYMS = new Set(["uma"]);

// titleCase renders a raw snake_case/lowercase DB value (e.g. a local_status
// not covered by a display-label lookup table) as operator-facing text, e.g.
// "verified" -> "Verified", "manually_resolved" -> "Manually Resolved",
// "uma_proposed" -> "UMA Proposed".
export function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) =>
      TITLE_CASE_ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

// formatFootballSeason renders an api-football "start year" integer as the
// operator-facing "YYYY/YYYY+1" label. The integer remains the wire format
// (and the DB representation); only the UI swaps in the prettier form.
export function formatFootballSeason(startYear: number | null | undefined): string {
  if (startYear == null || !Number.isFinite(startYear)) return "—";
  return `${startYear}/${startYear + 1}`;
}
