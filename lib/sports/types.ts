import type { SportsTagSpec } from "@/lib/types";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

// SportContest is the sport-neutral projection of a stored fixture payload.
// Every vendor shapes its payload differently — soccer nests the match under
// `fixture` and splits scores into `goals` / `score.fulltime`, hockey puts
// everything at the top level with a flat `scores` — so each sport supplies
// its own parser and the UI only ever reads this shape.
export type SportContest = {
  homeName: string;
  awayName: string;
  leagueName: string;
  country: string;
  statusShort: string;
  scoreHome: number | null;
  scoreAway: number | null;

  // partial is the mid-contest checkpoint a sport reports separately from
  // the final score — soccer's halftime. Sports without one leave it unset.
  partialLabel?: string;
  partialHome?: number | null;
  partialAway?: number | null;
};

// MarketTypeUi describes one market behavior an operator can enable on a
// task. `key` matches sport_market_types.key seeded by the migration.
export type MarketTypeUi = {
  key: string;
  label: string;
  note: string;
};

// ContestNoun is what this sport calls one scheduled contest. Soccer plays
// fixtures, hockey plays games, and the copy reads wrong if we pick one
// globally. The persistence layer keeps saying "fixture" regardless.
export type ContestNoun = {
  singular: string;
  plural: string;
  startLabel: string;
};

export type SportUi = {
  key: string;
  label: string;
  shortLabel: string;
  description: string;

  // available is false for sports we advertise but haven't wired a provider
  // for. Their hub card renders as "coming soon" and has no route.
  available: boolean;

  contest: ContestNoun;
  marketTypes: MarketTypeUi[];

  // seasonOptions lists the seasons offered in the new-task form, newest
  // first, and formatSeason renders one for display.
  seasonOptions: () => number[];
  defaultSeason: () => number;
  formatSeason: (season: number | null | undefined) => string;

  // statusTone colors a vendor status short code, and isLiveStatus reports
  // whether the contest is currently under way.
  statusTone: (statusShort: string) => StatusTone;
  isLiveStatus: (statusShort: string) => boolean;

  // suggestTags seeds the tag chips when an operator picks a league.
  suggestTags: (opts: { leagueName?: string; country?: string; season: number }) => SportsTagSpec[];

  // parseContest projects a stored fixture payload. Returns null when the
  // payload is missing or shaped unexpectedly, which callers render as "—"
  // rather than crashing the page.
  parseContest: (payload: unknown) => SportContest | null;
};
