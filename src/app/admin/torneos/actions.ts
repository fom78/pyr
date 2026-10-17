"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { prizesFromLists } from "@/server/tournaments/prizes";
import { cancelTournament, generateTournamentQuizzes, publishTournament, saveTournament, stopRepeating } from "@/server/tournaments/service";
import { formValues, toFormState, type FormState } from "@/server/actions";
import { DEFAULT_TZ, fromDateTimeInput } from "@/lib/format";

export async function saveTournamentAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let target = id;
  try {
    const user = await authorize("tournament.manage");
    // El formulario carga y muestra el calendario en hora de Buenos Aires (como el de la liga).
    const date = (k: string) => fromDateTimeInput(String(fd.get(k) ?? ""), DEFAULT_TZ);
    const prizes = prizesFromLists(String(fd.get("prizes") ?? ""), String(fd.get("prizeStars") ?? ""));
    const t = await saveTournament(
      id,
      {
        name: fd.get("name"),
        slug: fd.get("slug") || undefined,
        description: fd.get("description") || undefined,
        imageKey: fd.get("imageKey") || undefined,
        categoryIds: fd.getAll("categoryIds").map(String),
        startsAt: date("startsAt"),
        quizCount: fd.get("quizCount"),
        frequencyHours: fd.get("frequencyHours"),
        quizActiveHours: fd.get("quizActiveHours"),
        registrationLeadDays: fd.get("registrationLeadDays"),
        lateEntryDays: fd.get("lateEntryDays"),
        questionsPerQuiz: fd.get("questionsPerQuiz"),
        autoQuizzes: fd.get("autoQuizzes") === "on",
        repeatEveryDays: fd.get("repeatEveryDays") ? Number(fd.get("repeatEveryDays")) : null,
        entryCost: fd.get("entryCost"),
        maxParticipants: fd.get("maxParticipants") ? Number(fd.get("maxParticipants")) : null,
        wildcardsPerQuiz: fd.get("wildcardsPerQuiz"),
        wildcards: (["DOUBLE_TOTAL", "DOUBLE_PER_CORRECT", "TRIPLE_SURPRISE"] as const).map((type) => ({
          type,
          quantity: Number(fd.get(`wc.${type}`) || 0),
        })),
        prizes,
        scoring: { base: fd.get("base"), timeBonus: fd.get("timeBonus"), wrongPenalty: fd.get("wrongPenalty") },
        format: fd.get("format") ?? "POINTS",
        seeding: fd.get("seeding") ?? "QUALIFICATION",
        autoConfirmQualified: fd.get("autoConfirmQualified") === "on",
        thirdPlaceMatch: fd.get("thirdPlaceMatch") === "on",
        questionSource: fd.get("questionSource") ?? "NEW_FIRST",
        uniqueQuestions: fd.get("uniqueQuestions") ? Number(fd.get("uniqueQuestions")) : null,
        qualifiers: fd
          .getAll("q.source")
          .map((source, i) => ({ sourceTournamentId: String(source), topN: fd.getAll("q.topN")[i] }))
          .filter((q) => q.sourceTournamentId),
      },
      user,
    );
    target = t.id;
    revalidatePath("/admin/torneos");
  } catch (err) {
    return toFormState(err, values);
  }
  if (!id) redirect(`/admin/torneos/${target}`);
  revalidatePath(`/admin/torneos/${id}`);
  return { ok: true, message: "Torneo guardado." };
}

async function run(fn: () => Promise<unknown>, id: string, message: string): Promise<FormState> {
  try {
    await fn();
    revalidatePath(`/admin/torneos/${id}`);
    return { ok: true, message };
  } catch (err) {
    return toFormState(err);
  }
}

export async function publishTournamentAction(id: string) {
  const user = await authorize("tournament.manage");
  return run(() => publishTournament(id, user), id, "Torneo publicado.");
}

export async function generateQuizzesAction(id: string) {
  const user = await authorize("tournament.manage");
  return run(() => generateTournamentQuizzes(id, user), id, "Cuestionarios creados como borrador.");
}

/** Corta la serie: esta edición ya no crea la siguiente. */
export async function stopRepeatingAction(id: string) {
  const user = await authorize("tournament.manage");
  return run(() => stopRepeating(id, user), id, "Listo: no se crean más ediciones.");
}

export async function cancelTournamentAction(id: string, reason: string) {
  const user = await authorize("tournament.manage");
  return run(() => cancelTournament(id, reason, user), id, "Torneo cancelado y reembolsado.");
}
