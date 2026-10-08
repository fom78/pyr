"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/server/auth/guard";
import {
  changeCorrectOption,
  copyQuiz,
  createQuiz,
  deleteDraftQuiz,
  publishQuiz,
  recalculateQuiz,
  setQuestionVoided,
  setQuizQuestions,
  setQuizQuestionShuffle,
  unpublishQuiz,
  updateQuiz,
} from "@/server/quiz/service";
import { searchQuestions } from "@/server/questions/service";
import { formValues, toFormState, type FormState } from "@/server/actions";
import { fromDateTimeInput } from "@/lib/format";

function parseQuizForm(fd: FormData, tz: string) {
  const ref = String(fd.get("ref") ?? "");
  return {
    title: fd.get("title"),
    description: fd.get("description") || undefined,
    categoryId: ref.startsWith("c:") ? ref.slice(2) : undefined,
    tournamentId: ref.startsWith("t:") ? ref.slice(2) : undefined,
    opensAt: fromDateTimeInput(String(fd.get("opensAt")), tz),
    closesAt: fromDateTimeInput(String(fd.get("closesAt")), tz),
    expiresAt: fromDateTimeInput(String(fd.get("expiresAt")), tz),
    timeMode: fd.get("timeMode"),
    timeLimitSec: fd.get("timeLimitSec"),
    shuffleQuestions: fd.get("shuffleQuestions") === "on",
    shuffleOptions: fd.get("shuffleOptions") === "on",
    scoring: { base: fd.get("base"), timeBonus: fd.get("timeBonus"), wrongPenalty: fd.get("wrongPenalty") },
  };
}

export async function saveQuizAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let target = id;
  try {
    const user = await authorize("quiz.manage");
    const data = parseQuizForm(fd, user.timezone);
    if (id) await updateQuiz(id, data, user);
    else target = (await createQuiz(data, user)).id;
    revalidatePath("/admin/cuestionarios");
  } catch (err) {
    return toFormState(err, values);
  }
  if (!id) redirect(`/admin/cuestionarios/${target}`);
  revalidatePath(`/admin/cuestionarios/${id}`);
  return { ok: true, message: "Cambios guardados." };
}

export async function saveQuizQuestionsAction(id: string, questionIds: string[]): Promise<FormState> {
  try {
    const user = await authorize("quiz.manage");
    await setQuizQuestions(id, z.array(z.string()).max(200).parse(questionIds), user);
    revalidatePath(`/admin/cuestionarios/${id}`);
    return { ok: true, message: "Preguntas guardadas." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function pickerSearchAction(params: { q?: string; categoryId?: string; unused?: string; page?: number }) {
  await authorize("quiz.manage");
  const res = await searchQuestions({
    q: params.q,
    categoryId: params.categoryId || undefined,
    status: "APPROVED",
    unused: params.unused === "never" ? "never" : params.unused ? Number(params.unused) : undefined,
    page: params.page ?? 1,
    pageSize: 15,
  });
  return {
    pages: res.pages,
    total: res.total,
    items: res.items.map((q) => ({
      id: q.id,
      text: q.text,
      difficulty: q.difficulty,
      categories: q.categories.map((c) => c.category.name),
      used: q._count.quizQuestions,
      lastUsed: q.quizQuestions[0]?.quiz.opensAt.toISOString() ?? null,
      hasImage: q.type !== "TEXT",
    })),
  };
}

async function simple(fn: () => Promise<unknown>, path: string): Promise<FormState> {
  try {
    await fn();
    revalidatePath(path);
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}

export async function publishQuizAction(id: string) {
  const user = await authorize("quiz.publish");
  return simple(() => publishQuiz(id, user), `/admin/cuestionarios/${id}`);
}

export async function unpublishQuizAction(id: string) {
  const user = await authorize("quiz.publish");
  return simple(() => unpublishQuiz(id, user), `/admin/cuestionarios/${id}`);
}

export async function copyQuizAction(id: string) {
  const user = await authorize("quiz.manage");
  const copy = await copyQuiz(id, user);
  redirect(`/admin/cuestionarios/${copy.id}`);
}

export async function deleteQuizAction(id: string) {
  const user = await authorize("quiz.manage");
  await deleteDraftQuiz(id, user);
  redirect("/admin/cuestionarios");
}

export async function voidQuestionAction(quizId: string, quizQuestionId: string, voided: boolean) {
  const user = await authorize("quiz.recalculate");
  return simple(() => setQuestionVoided(quizQuestionId, voided, user), `/admin/cuestionarios/${quizId}`);
}

export async function shuffleOverrideAction(quizId: string, quizQuestionId: string, value: boolean | null) {
  const user = await authorize("quiz.manage");
  return simple(() => setQuizQuestionShuffle(quizQuestionId, value, user), `/admin/cuestionarios/${quizId}`);
}

export async function changeCorrectAction(quizId: string, questionId: string, optionId: string) {
  const user = await authorize("quiz.recalculate");
  return simple(() => changeCorrectOption(questionId, optionId, user), `/admin/cuestionarios/${quizId}`);
}

export async function recalculateQuizAction(id: string) {
  const user = await authorize("quiz.recalculate");
  return simple(() => recalculateQuiz(id, user), `/admin/cuestionarios/${id}`);
}
