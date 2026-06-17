import "server-only";

import { NextResponse } from "next/server";

import { auth, isUnauthorized } from "@/lib/api";
import { can, type Permission } from "@/lib/auth";

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
