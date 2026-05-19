import type { DeployPlan } from "./types";

export type PlanSource = "manual" | "crypto" | "sport";

// inferSourceFromPlan classifies a DeployPlan by who spawned it. Mirrors the
// same logic the deploy-plans list page uses, but returns "sport" (singular)
// to align with the unified market/event page query string convention.
export function inferSourceFromPlan(plan: DeployPlan): PlanSource {
  if (plan.actor === "sports-auto") return "sport";
  if (plan.note && plan.note.toLowerCase().startsWith("sports/")) return "sport";
  if (plan.actor === "crypto-auto") return "crypto";
  if (plan.note && plan.note.toLowerCase().startsWith("crypto/")) return "crypto";
  return "manual";
}
