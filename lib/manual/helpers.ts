// Helpers shared by the manual creator forms. Kept tiny and dependency-free —
// these are pure conversion / validation helpers, not stateful utilities.

// Convert an ISO 8601 timestamp to the local-time value an
// <input type="datetime-local"> control expects (YYYY-MM-DDTHH:mm).
// Returns "" for null/undefined so the controlled input renders empty.
export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// Convert the local-time value emitted by <input type="datetime-local"> into
// an ISO 8601 string in UTC. Returns undefined for empty input so the field
// is omitted from the request body.
export function localInputToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// Validate that a JSON-textarea value parses cleanly (or is empty). Used to
// surface a per-field error before the user submits.
export function isMetadataValid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

// Parse a JSON-textarea value; returns undefined when empty so the request
// omits the field. Throws on invalid JSON — callers should pre-check with
// isMetadataValid.
export function parseMetadata(
  value: string,
): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed);
}

// Stringify a metadata object back into the textarea-friendly form.
export function stringifyMetadata(
  value: Record<string, unknown> | undefined | null,
): string {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

// Generate a UUID v4. Used for correlation_id when grouping multi-step writes.
// Falls back to a manual implementation when crypto.randomUUID is unavailable
// (older browsers, some test environments).
export function newUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback per RFC 4122 v4.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Slug-safe lowercase conversion. The dpm-api requires URL-safe slugs; this
// is a pre-fill helper for the operator (they can still edit afterwards).
export function suggestSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// AI drafts emit order_price_min_tick_size as a number (Zod schema constraint
// matches the gamma source format), but dpm-api expects a decimal string. This
// adapter converts AI MarketDraft objects to MarketPayload objects with the
// numeric → string coercion. Returns a new object — does not mutate.
export function marketDraftToPayload<
  T extends { order_price_min_tick_size?: number | string | null | undefined },
>(draft: T): Omit<T, "order_price_min_tick_size"> & {
  order_price_min_tick_size?: string;
} {
  const { order_price_min_tick_size, ...rest } = draft;
  return {
    ...rest,
    order_price_min_tick_size:
      order_price_min_tick_size === null ||
      order_price_min_tick_size === undefined
        ? undefined
        : typeof order_price_min_tick_size === "number"
          ? String(order_price_min_tick_size)
          : order_price_min_tick_size,
  };
}
