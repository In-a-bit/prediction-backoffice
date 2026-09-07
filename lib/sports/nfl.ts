import { buildTags } from "@/lib/sports/tags";
import { num, obj, str, toneFrom } from "@/lib/sports/payload";
import { fetchSeasonsFor, formatStartYearSeason } from "@/lib/sports/seasons";
import type { SportContest, SportUi, StatusTone } from "@/lib/sports/types";

// api-american-football's documented status short codes. An unlisted code —
// including the empty string a null status reads as — falls through to
// neutral, which is the right default for something we cannot interpret.
const STATUS_TONES: Record<string, StatusTone> = {
  FT: "success",
  AOT: "success",
  Q1: "info",
  Q2: "info",
  Q3: "info",
  Q4: "info",
  HT: "info",
  OT: "info",
  PST: "warning",
  CANC: "danger",
};

const LIVE_STATUSES = new Set(["Q1", "Q2", "Q3", "Q4", "HT", "OT"]);

export const nfl: SportUi = {
  key: "nfl",
  label: "NFL",
  shortLabel: "NFL",
  description:
    "The NFL and NCAA on api-american-football. One moneyline market per game whose outcomes are the team names, settled on the final score including overtime — and resolved 50-50 when a game ends tied.",
  available: true,

  contest: { singular: "game", plural: "games", startLabel: "Kickoff" },

  marketTypes: [
    {
      key: "moneyline",
      label: "Moneyline (incl. OT)",
      note:
        "One market per game with the two team names as outcomes. Resolves on the final score, which already includes overtime. A tie resolves 50-50 — American football lets a regular-season game stand level — as does a cancelled game. A postponed one stays open until it is played.",
    },
  ],

  // This vendor identifies a season by its start year, so "2025" means the
  // 2025/26 season (Aug 2025 → Feb 2026).
  fetchSeasons: () => fetchSeasonsFor("nfl"),
  formatSeason: formatStartYearSeason,

  statusTone: toneFrom(STATUS_TONES),
  isLiveStatus: (statusShort) => LIVE_STATUSES.has(statusShort.toUpperCase()),

  suggestTags: ({ leagueName, country, season }) =>
    buildTags([leagueName, season, country, "Football", "NFL"]),

  parseContest,
};

// parseContest reads api-american-football's game shape: the contest sits
// under `game` rather than at the top level, as api-football nests a match
// under `fixture`, and the score is nested per team with a per-quarter
// breakdown, so `scores.home.total` is the number to show.
function parseContest(payload: unknown): SportContest | null {
  if (!payload || typeof payload !== "object") return null;
  const game = obj(payload, "game");
  const teams = obj(payload, "teams");
  const league = obj(payload, "league");
  const scores = obj(payload, "scores");

  return {
    homeName: str(obj(teams, "home"), "name", "Home"),
    awayName: str(obj(teams, "away"), "name", "Away"),
    leagueName: str(league, "name"),
    country: str(obj(league, "country"), "name"),
    statusShort: str(obj(game, "status"), "short"),
    scoreHome: num(obj(scores, "home").total),
    scoreAway: num(obj(scores, "away").total),
  };
}
