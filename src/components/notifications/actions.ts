"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { markRead } from "@/server/notifications/service";
import { UserError } from "@/server/errors";
import { toFormState, type FormState } from "@/server/actions";

async function currentUser() {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Tu sesión expiró. Volvé a ingresar.", "UNAUTHENTICATED", 401);
  return user;
}

/** Marca como leída una notificación propia (las que no tienen link no se "abren"). */
export async function markNotificationReadAction(id: string): Promise<FormState> {
  try {
    const user = await currentUser();
    await markRead(user.id, { ids: [z.string().min(1).parse(id)] });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}

/** "Marcar todas como leídas" de la campanita del panel (STAFF) o del juego (PLAYER). */
export async function markAllNotificationsReadAction(audience: "STAFF" | "PLAYER"): Promise<FormState> {
  try {
    const user = await currentUser();
    const n = await markRead(user.id, { audience: z.enum(["STAFF", "PLAYER"]).parse(audience) });
    revalidatePath("/", "layout");
    return { ok: true, message: n ? `${n} marcada${n === 1 ? "" : "s"} como leída${n === 1 ? "" : "s"}.` : "No había sin leer." };
  } catch (err) {
    return toFormState(err);
  }
}
