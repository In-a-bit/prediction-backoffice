import { inferSourceFromPlan } from "@/lib/source-from-plan";
import type { DeployPlan } from "@/lib/types";

// classifyPlans buckets a plan list by inferred source. Lives in a leading-
// underscore file so the route segment treats it as a private helper, not a
// route or page.
export function classifyPlans(plans: DeployPlan[]) {
  const out: Record<"manual" | "crypto" | "sport", DeployPlan[]> = {
    manual: [],
    crypto: [],
    sport: [],
  };
  for (const plan of plans) {
    const source = inferSourceFromPlan(plan);
    out[source].push(plan);
  }
  return out;
}

// Fallback for HTTP failures inside Promise.allSettled fan-outs.
export function unwrap<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}

export function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}

// Compact, locale-stable relative time helper. Used in operations dashboard
// + alerts list so the two share the same look.
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
