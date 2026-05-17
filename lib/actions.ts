"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import * as api from "./api";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function explain(err: unknown): string {
  if (err instanceof api.BackofficeApiError) {
    try {
      const parsed = JSON.parse(err.body) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // body wasn't JSON
    }
    return err.body || `request failed (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return "unexpected error";
}

// ---------- Tasks ----------

export async function createTaskAction(input: {
  asset_id: number;
  interval_id: number;
  time_ahead_minutes: number;
  first_market_at?: string;
  is_create_active: boolean;
  is_resolve_active: boolean;
}): Promise<ActionResult<{ id: number }>> {
  let task;
  try {
    task = await api.crypto.createTask(input);
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
  revalidatePath("/");
  revalidatePath("/automations");
  revalidatePath("/automations/crypto-interval");
  redirect(`/automations/crypto-interval/${task.id}`);
}

export async function updateTaskAction(
  id: number,
  input: { is_create_active?: boolean; is_resolve_active?: boolean; time_ahead_minutes?: number },
): Promise<ActionResult> {
  try {
    await api.crypto.updateTask(id, input);
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
  revalidatePath("/");
  revalidatePath("/automations");
  revalidatePath("/automations/crypto-interval");
  revalidatePath(`/automations/crypto-interval/${id}`);
  return { ok: true };
}

// ---------- Assets ----------

export async function listSupportedPairsAction(): Promise<
  ActionResult<import("./types").SupportedPair[]>
> {
  try {
    const data = await api.crypto.listSupportedPairs();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
}

export async function createAssetAction(input: {
  base: string;
  display_name: string;
  source_base: string;
  target?: string;
  source_target?: string;
  is_active?: boolean;
}): Promise<ActionResult<{ id: number }>> {
  try {
    const a = await api.crypto.createAsset(input);
    revalidatePath("/automations/crypto-interval/assets");
    revalidatePath("/automations/crypto-interval/new");
    return { ok: true, data: { id: a.id } };
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
}

export async function updateAssetAction(
  id: number,
  input: { display_name?: string; is_active?: boolean },
): Promise<ActionResult> {
  try {
    await api.crypto.updateAsset(id, input);
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
  revalidatePath("/automations/crypto-interval/assets");
  return { ok: true };
}
