"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/guard";
import { adjustCredits, banUser, revokeBan, setUserRole } from "@/server/users/service";
import { toFormState, type FormState } from "@/server/actions";
import { fromDateTimeInput } from "@/lib/format";

export async function setRoleAction(userId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await authorize("user.setRole");
    await setUserRole(userId, z.enum(["ADMIN", "MOD", "USER"]).parse(fd.get("role")), actor);
    revalidatePath(`/admin/usuarios/${userId}`);
    return { ok: true, message: "Rol actualizado." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function banAction(userId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await authorize("user.ban");
    const until = String(fd.get("endsAt") ?? "");
    await banUser(userId, { reason: fd.get("reason"), endsAt: fd.get("permanent") === "on" || !until ? null : fromDateTimeInput(until, actor.timezone) }, actor);
    revalidatePath(`/admin/usuarios/${userId}`);
    return { ok: true, message: "Usuario baneado." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function revokeBanAction(userId: string, banId: string): Promise<FormState> {
  try {
    const actor = await authorize("user.ban");
    await revokeBan(banId, actor);
    revalidatePath(`/admin/usuarios/${userId}`);
    return { ok: true, message: "Baneo levantado." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function adjustCreditsAction(userId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await authorize("credits.adjust");
    await adjustCredits(userId, { amount: fd.get("amount"), reason: fd.get("reason") }, actor);
    revalidatePath(`/admin/usuarios/${userId}`);
    return { ok: true, message: "Créditos ajustados." };
  } catch (err) {
    return toFormState(err);
  }
}
