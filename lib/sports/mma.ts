import { buildTags } from "@/lib/sports/tags";
import { obj, str, toneFrom } from "@/lib/sports/payload";
import { fetchSeasonsFor } from "@/lib/sports/seasons";
import type { SportContest, SportUi, StatusTone } from "@/lib/sports/types";

// api-mma's status vocabulary. Five of these are in-play, and they cover the
// pre-fight build-up as well as the bout itself — once a broadcast opens with
// intros and walkouts, the fight is minutes away.
const STATUS_TONES: Record<string, StatusTone> = {
  FT: "success",
  NS: "neutral",
  PF: "info",
  IN: "info",
  WO: "info",
  LIVE: "info",
  EOR: "info",
  PST: "warning",
  CANC: "danger",
};

const LIVE_STATUSES = new Set(["PF", "IN", "WO", "LIVE", "EOR"]);

export const mma: SportUi = {
  key: "mma",
  label: "MMA",
  shortLabel: "MMA",
  description:
    "UFC cards on api-mma. One moneyline market per fight whose outcomes are the two fighters, settled on the official result — with a 50-50 refund for a draw, a no contest, or a cancelled bout.",
  // Switched off: this vendor's handling of draws, no contests and postponed
  // bouts still needs investigating, so no operator can configure an MMA task
  // for now. The sport is hidden from the hub and its routes 404, but stored
  // mma rows keep rendering through the entry below. The Go side is off too —
  // see the commented-out KeyMMA factory in sportsapi/wiring.
  available: false,

  contest: { singular: "fight", plural: "fights", startLabel: "First bell" },

  marketTypes: [
    {
      key: "moneyline",
      label: "Moneyline",
      note:
        "One market per fight with the two fighter names as outcomes. Resolves on the official result rather than a score — this vendor publishes none. A draw or no contest resolves 50-50, as does a cancelled bout. A postponed fight stays open until it is rescheduled; the 15-day rule for one that never happens is applied by an operator.",
    },
  ],

  // A season here is a calendar year of cards, not a campaign spanning two,
  // so the token is shown as the vendor spelled it.
  fetchSeasons: () => fetchSeasonsFor("mma"),
  formatSeason: (season) => season || "—",

  statusTone: toneFrom(STATUS_TONES),
  isLiveStatus: (statusShort) => LIVE_STATUSES.has(statusShort.toUpperCase()),

  // The league name is the promotion, and there is no country to tag — the
  // organization is the whole grouping this sport has.
  suggestTags: ({ leagueName, season }) => buildTags([leagueName, season, "MMA", "UFC"]),

  parseContest,
};

// parseContest reads api-mma's fight shape, which is the odd one among the
// sports: the two sides are `fighters.first` and `fighters.second` rather than
// home and away teams, and there is no score anywhere — the result is a
// boolean on each corner. The scheduler projects first onto home and second
// onto away, and this mirrors that so the shared UI reads the pair the same
// way it reads two teams.
//
// The league name comes from the card slug's promotion rather than a league
// block, because this vendor publishes no leagues at all.
function parseContest(payload: unknown): SportContest | null {
  if (!payload || typeof payload !== "object") return null;
  const fighters = obj(payload, "fighters");
  const status = obj(payload, "status");
  const first = obj(fighters, "first");
  const second = obj(fighters, "second");

  return {
    homeName: str(first, "name", "First"),
    awayName: str(second, "name", "Second"),
    // The card, e.g. "UFC 311: Makhachev vs. Moicano". It names the event a
    // fight belongs to, which is the closest thing to a competition here.
    leagueName: str(payload as Record<string, unknown>, "slug"),
    country: "",
    statusShort: str(status, "short"),
    // There is no score in an MMA payload; the winner is a flag per fighter.
    scoreHome: null,
    scoreAway: null,
  };
}
