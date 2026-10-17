"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/guard";
import { enrollInTournament } from "@/server/tournaments/service";
import { confirmQualification } from "@/server/tournaments/knockout";
import { toFormState, type FormState } from "@/server/actions";

export async function enrollAction(tournamentId: string): Promise<FormState> {
  try {
    const user = await authorize("play");
    await enrollInTournament(user.id, tournamentId);
    revalidatePath("/", "layout");
    return { ok: true, message: "¡Inscripción confirmada! Mucha suerte." };
  } catch (err) {
    return toFormState(err);
  }
}

/** Clasificado desde otro torneo: confirma su lugar en la eliminatoria (gratis). */
export async function confirmQualificationAction(tournamentId: string): Promise<FormState> {
  try {
    const user = await authorize("play");
    await confirmQualification(user.id, tournamentId);
    revalidatePath("/", "layout");
    return { ok: true, message: "¡Lugar confirmado! Mucha suerte." };
  } catch (err) {
    return toFormState(err);
  }
}
