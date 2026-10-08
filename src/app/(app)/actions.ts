"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/server/auth/guard";
import { joinCategory, leaveCategory } from "@/server/league/service";
import { startAttempt } from "@/server/game/engine";
import { prisma } from "@/server/db";
import { toFormState, type FormState } from "@/server/actions";

export async function joinCategoryAction(categoryId: string): Promise<FormState> {
  try {
    const user = await authorize("play");
    const r = await joinCategory(user.id, categoryId);
    revalidatePath("/", "layout");
    return { ok: true, message: `¡Listo! Te quedan ${r.livesLeft} ${r.livesLeft === 1 ? "vida libre" : "vidas libres"}.` };
  } catch (err) {
    return toFormState(err);
  }
}

export async function leaveCategoryAction(categoryId: string): Promise<FormState> {
  try {
    const user = await authorize("play");
    await leaveCategory(user.id, categoryId);
    revalidatePath("/", "layout");
    return { ok: true, message: "Saliste de la categoría." };
  } catch (err) {
    return toFormState(err);
  }
}

const wildcardSchema = z.enum(["DOUBLE_TOTAL", "DOUBLE_PER_CORRECT", "TRIPLE_SURPRISE"]).nullable();

export async function startQuizAction(quizId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  let attemptId: string;
  try {
    const user = await authorize("play");
    const raw = fd.get("wildcard");
    const wildcard = wildcardSchema.parse(raw ? String(raw) : null);
    attemptId = (await startAttempt(user.id, quizId, { wildcard })).id;
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/jugar/${attemptId}`);
}

export async function completeOnboardingAction() {
  const user = await authorize("play").catch(() => null);
  if (user) await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  redirect(user ? "/categorias" : "/");
}
