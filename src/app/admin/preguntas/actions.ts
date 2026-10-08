"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/server/auth/guard";
import { userCan } from "@/server/auth/session";
import {
  createQuestion,
  createQuestionVersion,
  duplicateQuestion,
  findSimilarQuestions,
  reviewQuestion,
  setArchived,
  updateQuestion,
} from "@/server/questions/service";
import { toFormState, type FormState } from "@/server/actions";

const modeSchema = z.enum(["create", "update", "version"]);

export async function saveQuestionAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  let targetId: string | null = id;
  try {
    const mode = modeSchema.parse(fd.get("mode"));
    const payload = JSON.parse(String(fd.get("payload") ?? "{}"));
    const user = await authorize(mode === "create" ? "question.create" : "question.edit");
    const approve = fd.get("approve") === "on" && (await userCan(user, "question.autoApprove"));
    if (mode === "create") targetId = (await createQuestion(payload, user, { approve })).id;
    else if (mode === "update") await updateQuestion(id!, payload, user);
    else targetId = (await createQuestionVersion(id!, payload, user, approve)).id;
    revalidatePath("/admin/preguntas");
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/admin/preguntas/${targetId}?guardada=1`);
}

export async function checkDuplicatesAction(text: string, excludeId?: string) {
  await authorize("question.create");
  return findSimilarQuestions(text, { excludeId });
}

export async function reviewQuestionAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await authorize("question.review");
    const decision = z.enum(["APPROVED", "REJECTED", "PENDING_REVIEW"]).parse(fd.get("decision"));
    await reviewQuestion(id, decision, String(fd.get("comment") ?? ""), user);
    revalidatePath(`/admin/preguntas/${id}`);
    revalidatePath("/admin/preguntas");
    return { ok: true, message: decision === "APPROVED" ? "Pregunta aprobada." : decision === "REJECTED" ? "Pregunta rechazada." : "Vuelve a revisión." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function duplicateQuestionAction(id: string) {
  const user = await authorize("question.create");
  const q = await duplicateQuestion(id, user);
  redirect(`/admin/preguntas/${q.id}`);
}

export async function archiveQuestionAction(id: string, archived: boolean) {
  const user = await authorize("question.edit");
  await setArchived(id, archived, user);
  revalidatePath(`/admin/preguntas/${id}`);
}
