import { hockey } from "@/lib/sports/hockey";
import { soccer } from "@/lib/sports/soccer";
import type { SportContest, SportUi } from "@/lib/sports/types";

export type { SportContest, SportUi, MarketTypeUi, StatusTone } from "@/lib/sports/types";

// The UI registry. Adding a sport means one entry here plus the Go-side
// provider registration — `key` is the shared contract, matching sports.key
// in the backoffice database and the /automations/sports/<key> route.
//
// COMING_SOON entries are advertised on the hub but have no provider yet.
const REGISTRY: SportUi[] = [soccer, hockey];

const COMING_SOON: Pick<SportUi, "key" | "label" | "description">[] = [
  {
    key: "basketball",
    label: "Basketball",
    description: "Coming soon. Plugs into the same scheduler — a market type plus a basketball strategy.",
  },
  {
    key: "nfl",
    label: "NFL",
    description: "Coming soon. Same plugin pattern, on the api-sports American football host.",
  },
  {
    key: "mma",
    label: "MMA",
    description: "Coming soon. Single-fight moneyline + method-of-victory once the api-sports MMA client lands.",
  },
];

// sportUi returns the config for a sport key, or undefined when the key is
// unknown. Route handlers turn undefined into a 404.
export function sportUi(key: string): SportUi | undefined {
  return REGISTRY.find((entry) => entry.key === key);
}

// availableSports lists the sports an operator can actually configure.
export function availableSports(): SportUi[] {
  return REGISTRY.filter((entry) => entry.available);
}

// hubCards lists every sport for the /automations/sports landing page:
// the wired ones first, then the advertised-but-unbuilt ones.
export function hubCards(): { key: string; label: string; description: string; available: boolean }[] {
  return [
    ...availableSports().map((entry) => ({
      key: entry.key,
      label: entry.label,
      description: entry.description,
      available: true,
    })),
    ...COMING_SOON.map((entry) => ({ ...entry, available: false })),
  ];
}

// sportPath builds a route under a sport's section of the automations tree.
export function sportPath(sportKey: string, ...segments: (string | number)[]): string {
  const suffix = segments.length > 0 ? `/${segments.join("/")}` : "";
  return `/automations/sports/${sportKey}${suffix}`;
}

// parseContestFor projects a stored fixture payload using the sport's own
// parser, falling back to soccer's for rows whose sport we can't resolve —
// every pre-hockey row is soccer.
export function parseContestFor(sportKey: string | undefined, payload: unknown): SportContest | null {
  return uiOrSoccer(sportKey).parseContest(payload);
}

// statusToneFor colors a vendor status code using the sport's own status
// vocabulary. The codes collide across sports — hockey's "P1" and soccer's
// "P" are unrelated — so the sport has to pick the table.
export function statusToneFor(sportKey: string | undefined, statusShort: string) {
  return uiOrSoccer(sportKey).statusTone(statusShort);
}

// isLiveStatusFor reports whether a status code means "under way" for that
// sport. Same reason as statusToneFor: the codes are not a shared vocabulary.
export function isLiveStatusFor(sportKey: string | undefined, statusShort: string): boolean {
  return uiOrSoccer(sportKey).isLiveStatus(statusShort);
}

// uiOrSoccer resolves a sport, defaulting to soccer. Safe as a default only
// for reading stored rows: every row written before hockey existed is soccer.
// Never use it to route a request.
function uiOrSoccer(sportKey: string | undefined): SportUi {
  return (sportKey && sportUi(sportKey)) || soccer;
}
