import type { DeployPlanMarket } from "./types";

/** True when the market's end_date exists and is in the past. */
export function isMarketDeployDeadlinePassed(
  market: Pick<DeployPlanMarket, "end_date">,
  now = Date.now(),
): boolean {
  if (!market.end_date) return false;
  const end = new Date(market.end_date).getTime();
  return !Number.isNaN(end) && end <= now;
}

/** Next market the executor would deploy (not deployed/skipped). */
export function nextDeployableMarket(
  markets: DeployPlanMarket[],
): DeployPlanMarket | undefined {
  return markets.find(
    (m) => m.status !== "deployed" && m.status !== "skipped",
  );
}
