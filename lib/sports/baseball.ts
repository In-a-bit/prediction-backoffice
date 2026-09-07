import { buildTags } from "@/lib/sports/tags";
import { num, obj, str } from "@/lib/sports/payload";
import { fetchSeasonsFor } from "@/lib/sports/seasons";
import type { SportContest, SportUi, StatusTone } from "@/lib/sports/types";

// api-baseball's fixed status short codes. The in-play codes are not here:
// they are numbered per inning (IN1, IN2, … past IN9 into extra innings) and
// are matched by shape instead — see isInning.
const STATUS_TONES: Record<string, StatusTone> = {
  FT: "success",
  POST: "warning",
  // Interrupted, which is neither live nor over: the game may resume, be
  // abandoned, or be rescheduled. The backend treats it the same way — it
  // keeps waiting rather than settling anything (see the baseball provider's
  // statusGroup, and the identical handling of hockey's INTR).
  INTR: "warning",
  CANC: "danger",
  ABD: "danger",
};

// isInning reports whether a code is an in-play inning marker.
//
// Matching on shape rather than an IN1..IN9 list is deliberate, and mirrors
// the Go provider: a tied game keeps playing and the vendor keeps counting, so
// the set is open-ended. Requiring digits keeps the match tight enough that a
// future non-inning code beginning with "IN" would not be read as live.
function isInning(statusShort: string): boolean {
  return /^IN\d+$/.test(statusShort.toUpperCase());
}

export const baseball: SportUi = {
  key: "baseball",
  label: "Baseball",
  shortLabel: "Baseball",
  description:
    "MLB, NPB, KBO and every other league on api-baseball. One moneyline market per game whose outcomes are the team names, settled on the final run total including extra innings.",
  available: true,

  contest: { singular: "game", plural: "games", startLabel: "First pitch" },

  marketTypes: [
    {
      key: "moneyline",
      label: "Moneyline (incl. extras)",
      note:
        "One market per game with the two team names as outcomes. Resolves on the final run total, which already includes extra innings — baseball plays on until the tie breaks, so there is no draw. A cancelled or abandoned game resolves 50-50; a postponed one stays open until it is played.",
    },
  ],

  // A baseball season runs inside a single calendar year (spring to autumn),
  // so a bare year means exactly that year — rendering it as "2025/2026" the
  // way soccer and hockey do would name a season that does not exist.
  fetchSeasons: () => fetchSeasonsFor("baseball"),
  formatSeason: (season) => season || "—",

  statusTone: (statusShort) => {
    const code = statusShort.toUpperCase();
    if (isInning(code)) return "info";
    return STATUS_TONES[code] ?? "neutral";
  },
  isLiveStatus: isInning,

  suggestTags: ({ leagueName, country, season }) =>
    buildTags([leagueName, season, country, "Baseball"]),

  parseContest,
};

// parseContest reads api-baseball's game shape: flat like api-basketball's,
// with the country beside the league rather than inside it, and a per-team
// score carrying hits, errors and an inning-by-inning breakdown alongside the
// run total. `scores.home.total` is the number to show.
function parseContest(payload: unknown): SportContest | null {
  if (!payload || typeof payload !== "object") return null;
  const teams = obj(payload, "teams");
  const league = obj(payload, "league");
  const scores = obj(payload, "scores");
  const status = obj(payload, "status");

  return {
    homeName: str(obj(teams, "home"), "name", "Home"),
    awayName: str(obj(teams, "away"), "name", "Away"),
    leagueName: str(league, "name"),
    country: str(obj(payload, "country"), "name") || str(obj(league, "country"), "name"),
    statusShort: str(status, "short"),
    scoreHome: num(obj(scores, "home").total),
    scoreAway: num(obj(scores, "away").total),
  };
}
