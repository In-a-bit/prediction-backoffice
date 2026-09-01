// Shared helpers for reading vendor fixture payloads. Every accessor is
// defensive: payloads are stored verbatim as the upstream returned them, so
// a vendor reshaping a field must degrade to "—" rather than throw inside a
// server component.

export function obj(source: unknown, key: string): Record<string, unknown> {
  if (!source || typeof source !== "object") return {};
  const value = (source as Record<string, unknown>)[key];
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

export function str(source: Record<string, unknown>, key: string, fallback = ""): string {
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : fallback;
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// toneFrom builds a statusTone function from a code→tone table. Unlisted
// codes are neutral, which is the right default for a vendor adding a status
// we haven't mapped yet.
export function toneFrom<T extends string>(
  table: Record<string, T>,
): (statusShort: string) => T | "neutral" {
  return (statusShort: string) => table[statusShort.toUpperCase()] ?? "neutral";
}
