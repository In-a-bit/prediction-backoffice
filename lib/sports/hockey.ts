import { buildTags } from "@/lib/sports/tags";
import { num, obj, str, toneFrom } from "@/lib/sports/payload";
import { fetchSeasonsFor, formatStartYearSeason } from "@/lib/sports/seasons";
import type { SportContest, SportUi, StatusTone } from "@/lib/sports/types";

// api-hockey status short codes. The vocabulary overlaps soccer's only
// partially: postponed is POST rather than PST, and the finished set carries
// AOT (after overtime) and AP (after penalties) alongside FT.
const STATUS_TONES: Record<string, StatusTone> = {
  FT: "success",
  AOT: "success",
  AP: "success",
  AW: "success",
  P1: "info",
  P2: "info",
  P3: "info",
  OT: "info",
  PT: "info",
  BT: "info",
  POST: "warning",
  INTR: "warning",
  CANC: "danger",
  ABD: "danger",
};

const LIVE_STATUSES = new Set(["P1", "P2", "P3", "OT", "PT", "BT"]);

export const hockey: SportUi = {
  key: "hockey",
  label: "Hockey",
  shortLabel: "Hockey",
  description:
    "NHL and every other league on api-hockey. One moneyline market per game whose outcomes are the team names, settled on the final score including overtime and the shootout.",
  available: true,

  contest: { singular: "game", plural: "games", startLabel: "Puck drop" },

  marketTypes: [
    {
      key: "moneyline",
      label: "Moneyline (incl. OT/SO)",
      note:
        "One market per game with the two team names as outcomes. Resolves on the final score, which already includes overtime and the shootout — so there is no tie. A cancelled game resolves 50-50; a postponed one stays open until it is played.",
    },
  ],

  // api-hockey identifies a season by its start year, so "2025" means the
  // 2025/26 season (Sep 2025 → Jun 2026). Its /seasons endpoint publishes the
  // years it holds data for, which is what the dropdown offers.
  fetchSeasons: () => fetchSeasonsFor("hockey"),
  formatSeason: formatStartYearSeason,

  statusTone: toneFrom(STATUS_TONES),
  isLiveStatus: (statusShort) => LIVE_STATUSES.has(statusShort.toUpperCase()),

  suggestTags: ({ leagueName, country, season }) =>
    buildTags([leagueName, season, country, "Hockey", "Ice Hockey"]),

  parseContest,
};

// parseContest reads api-hockey's flat game shape: no `fixture` wrapper, a
// top-level `scores` that is already the final score, and `periods` for the
// per-period breakdown.
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
    scoreHome: num(scores.home),
    scoreAway: num(scores.away),
  };
}
