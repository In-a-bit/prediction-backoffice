import type { BuilderPaybisInput } from "./api";

export const PAYBIS_FIELDS = [
  "paybis_api_key",
  "paybis_private_key",
  "paybis_provider_public_key",
] as const satisfies readonly (keyof BuilderPaybisInput)[];

export type PaybisField = (typeof PAYBIS_FIELDS)[number];

// paybisFields trims the Paybis credentials out of a request body, dropping the
// blank ones. dpm-api ignores a blank value, so sending it would be a silent
// no-op rather than the clear an operator might expect.
export function paybisFields(
  body: Partial<BuilderPaybisInput>,
): BuilderPaybisInput {
  const patch: BuilderPaybisInput = {};
  for (const field of PAYBIS_FIELDS) {
    const value = body[field]?.trim();
    if (value) patch[field] = value;
  }
  return patch;
}
