// Server-safe constants and types shared by the resolutions page (a server
// component) and its table (a "use client" component). These must not live in
// the client module: a server component importing a non-component export from a
// "use client" file receives a client-reference proxy rather than the value, so
// the tab key would stringify to a throwing function and break the tab links.

/**
 * The tab listing markets that an outside party proposed or disputed. Not a
 * local_status bucket — the rows come straight from the dpm-side external
 * flags, so the key lives here alongside the table that renders them.
 */
export const EXTERNAL_TAB = "external";
export const EXTERNAL_TAB_LABEL = "External activity";

/** "" means both flags — see filterExternalKind on the page. */
export type ExternalKindFilter = "" | "proposal" | "dispute";

/**
 * How many of the tab's rows carry each flag, counted before the kind filter is
 * applied. Shown in the filter labels so a dispute is visible without having to
 * switch the filter to discover it. A market can carry both flags, so the two
 * do not have to add up to `total`.
 */
export type ExternalKindCounts = {
  total: number;
  proposal: number;
  dispute: number;
};
