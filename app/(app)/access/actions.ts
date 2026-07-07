"use server";

import { revalidatePath } from "next/cache";

import { auth, roles, users, BackofficeApiError } from "@/lib/api";
import type { Permission } from "@/lib/auth";

export type ActionResult = { ok: boolean; error?: string };

function fail(err: unknown): ActionResult {
  if (err instanceof BackofficeApiError) {
    // The Go body is JSON like {"error":"..."}; surface the message if present.
    try {
      const parsed = JSON.parse(err.body) as { error?: string };
      if (parsed.error) return { ok: false, error: parsed.error };
    } catch {
      /* fall through */
    }
    return { ok: false, error: err.body || `request failed (${err.status})` };
  }
  return { ok: false, error: "Unexpected error" };
}

export async function createUser(input: {
  email: string;
  password: string;
  role_ids: number[];
}): Promise<ActionResult> {
  try {
    await users.create(input);
    revalidatePath("/access/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateUser(
  id: number,
  patch: { is_active?: boolean; role_ids?: number[]; new_password?: string },
): Promise<ActionResult> {
  try {
    await users.update(id, patch);
    revalidatePath("/access/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createRole(input: {
  name: string;
  description?: string;
  permissions: Permission[];
}): Promise<ActionResult> {
  try {
    await roles.create(input);
    revalidatePath("/access/roles");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRole(
  id: number,
  patch: { description?: string; permissions?: Permission[] },
): Promise<ActionResult> {
  try {
    await roles.update(id, patch);
    revalidatePath("/access/roles");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRole(id: number): Promise<ActionResult> {
  try {
    await roles.remove(id);
    revalidatePath("/access/roles");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult> {
  try {
    await auth.changePassword(currentPassword, newPassword);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
