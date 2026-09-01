import type { ReactNode } from "react";

export type BehaviorKey = "crypto-interval" | "manual" | "sports";
export type BehaviorStatus = "available" | "coming-soon";

export type Behavior = {
  key: BehaviorKey;
  name: string;
  short: string;
  tagline: string;
  description: string;
  status: BehaviorStatus;
  href: string;
  newHref: string;
  // CSS color value used as a per-behavior accent on cards, dots, badges, etc.
  accent: string;
  // Soft background tint pairing with `accent` for surfaces.
  accentSoft: string;
  icon: ReactNode;
  features: string[];
};

const cryptoIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-full w-full"
  >
    <path d="M3 17 9 11l4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

const manualIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-full w-full"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const sportsIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-full w-full"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
  </svg>
);

export const behaviors: Record<BehaviorKey, Behavior> = {
  "crypto-interval": {
    key: "crypto-interval",
    name: "Crypto Intervals",
    short: "Crypto",
    tagline: "Auto up/down markets on fixed crypto intervals",
    description:
      "Pair a crypto asset with an interval. Each slot becomes a crypto_event with its own DeployPlan — the same plan UI that powers manual + sports — and an outbox-driven dispatcher reports CTF payouts when the slot closes.",
    status: "available",
    href: "/automations/crypto-interval",
    newHref: "/automations/crypto-interval/new",
    accent: "#f59e0b",
    accentSoft: "rgba(245, 158, 11, 0.12)",
    icon: cryptoIcon,
    features: [
      "Per-slot crypto_events spawn a DeployPlan you can monitor on /deploy-plans",
      "Sequential CTF market creation via the shared runner (Up / Down outcome tokens)",
      "Decision outbox protects partial reportPayouts retries from price-revision races",
      "Manual force-create + skip-event escape hatches per slot",
    ],
  },
  manual: {
    key: "manual",
    name: "Manual Markets",
    short: "Manual",
    tagline: "Hand-craft series, events, and markets end to end",
    description:
      "Compose series, events, and markets by hand — full field control for one-off launches. Includes a Polymarket-slug ingestor and an AI-from-description drafter for high-volume prep work.",
    status: "available",
    href: "/automations/manual",
    newHref: "/automations/manual",
    accent: "#8b5cf6",
    accentSoft: "rgba(139, 92, 246, 0.12)",
    icon: manualIcon,
    features: [
      "Series / event / market creators with the full dpm-api field set",
      "Create event from a Polymarket slug via Gemini",
      "Draft an event or a series of events from a freeform description",
      "Sequential market deploy with monitor, recreate, and skip controls",
      "Operator audit log for every create",
    ],
  },
  sports: {
    key: "sports",
    name: "Sports Fixtures",
    short: "Sports",
    tagline: "Generate UMA markets from upcoming games",
    description:
      "Subscribe to a league + season. As games appear in the feed, the backoffice spins up the configured market behaviors per contest (moneyline, halftime, …) inside a sequential DeployPlan, then auto-proposes resolution to UMA when the game finishes. Soccer and hockey are wired; further sports slot in without schema changes.",
    status: "available",
    href: "/automations/sports",
    // Points at the hub rather than one sport's form: which sport comes
    // first is now a choice, not a default.
    newHref: "/automations/sports",
    accent: "#10b981",
    accentSoft: "rgba(16, 185, 129, 0.12)",
    icon: sportsIcon,
    features: [
      "Per-league config — pick league, season, market behaviors, lead-time",
      "Sequential market creation via the existing DeployPlan UI",
      "Auto-propose to UMA + resolve after liveness; manual override always available",
      "Soccer moneyline + halftime and hockey moneyline today; over-under / player-props next",
    ],
  },
};

export const behaviorList: Behavior[] = [
  behaviors["crypto-interval"],
  behaviors.manual,
  behaviors.sports,
];
