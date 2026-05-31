import type { Instrumentation } from "next";

// instrumentation.ts is Next.js 16's blessed seam for observability hooks.
// register() runs once per server instance; onRequestError fires for every
// unhandled error in a server component, route handler, or server action.
//
// We use it to mirror server-side errors into the operator alerts feed so
// every red toast in the UI has a corresponding row on /operations/alerts.

export async function register(): Promise<void> {
  // Reserved for future Sentry / OTel init. Kept as a no-op so wiring the
  // hook costs nothing today.
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  // Imported lazily so the (server-only) recorder + its transitive
  // imports don't run at edge cold-start when this file is also loaded
  // for edge instrumentation.
  const { recordAlert } = await import("./lib/observability/recorder");

  const error = err as Error & { digest?: string };
  await recordAlert({
    severity: "error",
    source: "system",
    action: `${context.routeType ?? "unknown"}:${context.routePath ?? "unknown"}`,
    message: error.message || "unknown server error",
    error,
    correlation_id: error.digest,
    request_payload: {
      path: request.path,
      method: request.method,
      router_kind: context.routerKind,
      render_source: context.renderSource,
    },
  });
};
