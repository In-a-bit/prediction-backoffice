import "server-only";

import { NextResponse } from "next/server";

import { auth, BackofficeApiError, isUnauthorized } from "@/lib/api";
import { can, type Permission } from "@/lib/auth";

// proxyError maps an error from a Go-backed proxy call into a NextResponse,
// forwarding the upstream status (401/403/409/…) so RBAC denials and conflicts
// surface to the client unchanged. Used by route handlers that proxy the Go
// backoffice (which already enforces RBAC and audits) rather than enforcing
// locally with ensurePermission.
export function proxyError(err: unknown): NextResponse {
  if (err instanceof BackofficeApiError) {
    return NextResponse.json({ error: err.body || err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

// ensurePermission enforces a permission inside a Next route handler that calls
// dpm-api directly (bypassing Go's RBAC). It returns a NextResponse to send back
// when the caller is unauthenticated (401) or lacks the permission (403), or
// null when the caller is allowed to proceed.
export async function ensurePermission(
  perm: Permission,
): Promise<NextResponse | null> {
  try {
    const me = await auth.me();
    if (!can(me.permissions, perm)) {
      return NextResponse.json(
        { error: "forbidden", required_permission: perm },
        { status: 403 },
      );
    }
    return null;
  } catch (err) {
    if (isUnauthorized(err)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
