"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { formValues, toFormState, type FormState } from "@/server/actions";
import {
  cancelRun,
  deleteStage,
  launchSeason,
  moveStage,
  saveRules,
  saveSeason,
  saveStage,
  setSeasonArchived,
  stopSeasonRepeat,
} from "@/server/seasons/service";
import { tournamentFromForm } from "../torneos/form-data";

export async function saveSeasonAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let target = id;
  try {
    const user = await authorize("tournament.manage");
    const s = await saveSeason(
      id,
      {
        name: fd.get("name"),
        description: fd.get("description") || undefined,
        imageKey: fd.get("imageKey") || undefined,
        repeatAfterDays: fd.get("repeatAfterDays") === "" || fd.get("repeatAfterDays") == null ? null : Number(fd.get("repeatAfterDays")),
      },
      user,
    );
    target = s.id;
    revalidatePath("/admin/temporadas");
  } catch (err) {
    return toFormState(err, values);
  }
  if (!id) redirect(`/admin/temporadas/${target}`);
  revalidatePath(`/admin/temporadas/${id}`);
  return { ok: true, message: "Temporada guardada." };
}

/** Formulario de torneo en modo plantilla: "día N + hora" en vez de fecha. */
export async function saveStageAction(seasonId: string, stageId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const user = await authorize("tournament.manage");
    // saveStage descarta lo que no va en una plantilla (slug, clasificatorios, serie).
    const { name, ...config } = tournamentFromForm(fd);
    await saveStage(seasonId, stageId, { name, offsetDays: fd.get("offsetDays"), startTime: fd.get("startTime") }, config, user);
  } catch (err) {
    return toFormState(err, values);
  }
  revalidatePath(`/admin/temporadas/${seasonId}`);
  redirect(`/admin/temporadas/${seasonId}`);
}

async function run(fn: () => Promise<unknown>, seasonId: string, message: string): Promise<FormState> {
  try {
    await fn();
    revalidatePath(`/admin/temporadas/${seasonId}`);
    revalidatePath("/admin/temporadas");
    return { ok: true, message };
  } catch (err) {
    return toFormState(err);
  }
}

export async function deleteStageAction(seasonId: string, stageId: string) {
  const user = await authorize("tournament.manage");
  return run(() => deleteStage(stageId, user), seasonId, "Torneo quitado de la temporada.");
}

export async function moveStageAction(seasonId: string, stageId: string, dir: -1 | 1) {
  const user = await authorize("tournament.manage");
  return run(() => moveStage(stageId, dir, user), seasonId, "Orden actualizado.");
}

export async function saveRulesAction(
  seasonId: string,
  rules: { sourceStageId: string; targetStageId: string; fromRank: number; toRank: number }[],
) {
  const user = await authorize("tournament.manage");
  return run(() => saveRules(seasonId, rules, user), seasonId, "Reglas guardadas.");
}

export async function launchSeasonAction(seasonId: string, day0: string) {
  const user = await authorize("tournament.manage");
  revalidatePath("/admin/torneos");
  return run(() => launchSeason(seasonId, day0, user), seasonId, "Temporada lanzada: sus torneos ya están publicados.");
}

export async function cancelRunAction(seasonId: string, runId: string, reason: string) {
  const user = await authorize("tournament.manage");
  return run(() => cancelRun(runId, reason, user), seasonId, "Instancia cancelada y reembolsada.");
}

export async function stopRepeatAction(seasonId: string) {
  const user = await authorize("tournament.manage");
  return run(() => stopSeasonRepeat(seasonId, user), seasonId, "Listo: no se lanzan más instancias solas.");
}

export async function archiveSeasonAction(seasonId: string, archived: boolean) {
  const user = await authorize("tournament.manage");
  return run(() => setSeasonArchived(seasonId, archived, user), seasonId, archived ? "Temporada archivada." : "Temporada reactivada.");
}
