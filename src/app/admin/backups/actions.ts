"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/guard";
import { requestBackup } from "@/server/backups/service";
import { toFormState, type FormState } from "@/server/actions";

export async function requestBackupAction(): Promise<FormState> {
  try {
    const user = await authorize("backup.manage");
    await requestBackup(user);
    revalidatePath("/admin/backups");
    return { ok: true, message: "Backup pedido: el worker lo genera en el próximo minuto." };
  } catch (err) {
    return toFormState(err);
  }
}
