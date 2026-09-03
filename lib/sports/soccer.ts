import { buildTags } from "@/lib/sports/tags";
import { num, obj, str, toneFrom } from "@/lib/sports/payload";
import { fetchSeasonsFor, formatStartYearSeason } from "@/lib/sports/seasons";
import type { SportContest, SportUi, StatusTone } from "@/lib/sports/types";

// api-football status short codes. Grouped by what an operator needs to
// know at a glance: finished, in play, delayed, and abandoned.
const STATUS_TONES: Record<string, StatusTone> = {
  FT: "success",
  AET: "success",
  PEN: "success",
  "1H": "info",
  HT: "info",
  "2H": "info",
  ET: "info",
  BT: "info",
  P: "info",
  LIVE: "info",
  PST: "warning",
  SUSP: "warning",
  INT: "warning",
  CANC: "danger",
  ABD: "danger",
  AWD: "danger",
  WO: "danger",
};

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"]);

export const soccer: SportUi = {
  key: "soccer",
  label: "Soccer (Football)",
  shortLabel: "Soccer",
  description:
    "EPL, La Liga, Bundesliga, Champions League — any league/season on api-football. Moneyline + halftime markets per fixture, auto-proposed to UMA.",
  available: true,

  contest: { singular: "fixture", plural: "fixtures", startLabel: "Kickoff" },

  marketTypes: [
    {
      key: "moneyline",
      label: "Moneyline (regulation)",
      note:
        "3 Yes/No markets per fixture (home wins, draw, away wins). Resolved on score.fulltime — extra time and penalty shootouts count as a draw.",
    },
    {
      key: "halftime",
      label: "Halftime",
      note:
        "3 Yes/No markets per fixture for the halftime score. Resolves as soon as the fixture reaches HT (status >= HT).",
    },
  ],

  // api-football identifies a season by its start year, so "2025" means the
  // 2025/26 campaign. It publishes the years it holds data for at
  // /leagues/seasons, which is what the dropdown offers.
  fetchSeasons: () => fetchSeasonsFor("soccer"),
  formatSeason: formatStartYearSeason,

  statusTone: toneFrom(STATUS_TONES),
  isLiveStatus: (statusShort) => LIVE_STATUSES.has(statusShort.toUpperCase()),

  suggestTags: ({ leagueName, country, season }) =>
    buildTags([leagueName, season, country, "Soccer", "Football"]),

  parseContest,
};

// parseContest reads api-football's nested fixture shape: the match lives
// under `fixture`, the running score under `goals`, and the per-period
// breakdown under `score`.
function parseContest(payload: unknown): SportContest | null {
  if (!payload || typeof payload !== "object") return null;
  const teams = obj(payload, "teams");
  const league = obj(payload, "league");
  const goals = obj(payload, "goals");
  const score = obj(payload, "score");
  const fulltime = obj(score, "fulltime");
  const halftime = obj(score, "halftime");
  const status = obj(obj(payload, "fixture"), "status");

  return {
    homeName: str(obj(teams, "home"), "name", "Home"),
    awayName: str(obj(teams, "away"), "name", "Away"),
    leagueName: str(league, "name"),
    country: str(league, "country"),
    statusShort: str(status, "short"),
    scoreHome: num(fulltime.home) ?? num(goals.home),
    scoreAway: num(fulltime.away) ?? num(goals.away),
    partialLabel: "Halftime",
    partialHome: num(halftime.home),
    partialAway: num(halftime.away),
  };
}
