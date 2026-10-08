"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { cancelTournament, generateTournamentQuizzes, publishTournament, saveTournament } from "@/server/tournaments/service";
import { formValues, toFormState, type FormState } from "@/server/actions";
import { fromDateTimeInput } from "@/lib/format";

export async function saveTournamentAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let target = id;
  try {
    const user = await authorize("tournament.manage");
    const tz = user.timezone;
    const date = (k: string) => fromDateTimeInput(String(fd.get(k) ?? ""), tz);
    const prizes = String(fd.get("prizes") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((credits, i) => ({ rank: i + 1, credits: Number(credits) }));
    const t = await saveTournament(
      id,
      {
        name: fd.get("name"),
        slug: fd.get("slug") || undefined,
        description: fd.get("description") || undefined,
        imageKey: fd.get("imageKey") || undefined,
        categoryIds: fd.getAll("categoryIds").map(String),
        startsAt: date("startsAt"),
        endsAt: date("endsAt"),
        registrationOpensAt: date("registrationOpensAt"),
        registrationEndsAt: date("registrationEndsAt"),
        quizCount: fd.get("quizCount"),
        frequencyDays: fd.get("frequencyDays"),
        entryCost: fd.get("entryCost"),
        maxParticipants: fd.get("maxParticipants") ? Number(fd.get("maxParticipants")) : null,
        wildcardsPerQuiz: fd.get("wildcardsPerQuiz"),
        wildcards: (["DOUBLE_TOTAL", "DOUBLE_PER_CORRECT", "TRIPLE_SURPRISE"] as const).map((type) => ({
          type,
          quantity: Number(fd.get(`wc.${type}`) || 0),
        })),
        prizes,
        scoring: { base: fd.get("base"), timeBonus: fd.get("timeBonus"), wrongPenalty: fd.get("wrongPenalty") },
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

export async function cancelTournamentAction(id: string, reason: string) {
  const user = await authorize("tournament.manage");
  return run(() => cancelTournament(id, reason, user), id, "Torneo cancelado y reembolsado.");
}
