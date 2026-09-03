import { buildTags } from "@/lib/sports/tags";
import { num, obj, str, toneFrom } from "@/lib/sports/payload";
import { fetchSeasonsFor } from "@/lib/sports/seasons";
import type { SportContest, SportUi, StatusTone } from "@/lib/sports/types";

// api-basketball status short codes. The live set is quarter-by-quarter, and
// unlike hockey there is no shootout state — a tie is replayed in overtime
// until it breaks, so AOT is a decided result.
const STATUS_TONES: Record<string, StatusTone> = {
  FT: "success",
  AOT: "success",
  AWD: "success",
  Q1: "info",
  Q2: "info",
  Q3: "info",
  Q4: "info",
  OT: "info",
  HT: "info",
  BT: "info",
  POST: "warning",
  // Suspended, which is neither live nor over: the game may resume, be
  // abandoned, or be rescheduled. The backend treats it the same way — it
  // keeps polling rather than settling anything (see the basketball provider's
  // statusGroup).
  SUSP: "warning",
  CANC: "danger",
  ABD: "danger",
};

const LIVE_STATUSES = new Set(["Q1", "Q2", "Q3", "Q4", "OT", "HT", "BT"]);

export const basketball: SportUi = {
  key: "basketball",
  label: "Basketball",
  shortLabel: "Basketball",
  description:
    "NBA, EuroLeague, NCAA and every other league on api-basketball. One moneyline market per game whose outcomes are the team names, settled on the final score including overtime.",
  available: true,

  contest: { singular: "game", plural: "games", startLabel: "Tip-off" },

  marketTypes: [
    {
      key: "moneyline",
      label: "Moneyline (incl. OT)",
      note:
        "One market per game with the two team names as outcomes. Resolves on the final score, which already includes overtime — basketball replays a tie until it breaks, so there is no draw. A cancelled or abandoned game resolves 50-50; a postponed one stays open until it is played.",
    },
  ],

  // api-basketball is the reason the season is a string: roughly half its
  // leagues are spelled as a dashed span ("2025-2026"), the rest as a start
  // year ("2019"), and a few as multi-year spans ("2022-2024"). Only the
  // vendor knows which, so the dropdown offers exactly what it publishes.
  fetchSeasons: () => fetchSeasonsFor("basketball"),
  // Shown as the vendor spelled it. A dashed span already reads as the two
  // years it covers, and a bare year here means a single-year season rather
  // than a campaign — so expanding it to "2019/2020" the way soccer and hockey
  // do would describe a different season than the one selected.
  formatSeason: (season) => season || "—",

  statusTone: toneFrom(STATUS_TONES),
  isLiveStatus: (statusShort) => LIVE_STATUSES.has(statusShort.toUpperCase()),

  suggestTags: ({ leagueName, country, season }) =>
    buildTags([leagueName, season, country, "Basketball"]),

  parseContest,
};

// parseContest reads api-basketball's game shape: the country sits beside the
// league rather than inside it, and the score is nested per team with a
// per-quarter breakdown, so `scores.home.total` is the number to show.
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
