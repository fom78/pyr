"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/guard";
import { markRead } from "@/server/notifications/service";
import { toFormState, type FormState } from "@/server/actions";

/** Marca como leídas las notificaciones indicadas, o todas si no se indica ninguna. */
export async function markReadAction(ids?: string[]): Promise<FormState> {
  try {
    const user = await authorize("admin.access");
    await markRead(user.id, ids ? z.array(z.string()).max(200).parse(ids) : undefined);
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}
