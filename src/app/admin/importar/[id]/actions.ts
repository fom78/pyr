"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { userCan } from "@/server/auth/session";
import { commitImport, discardImport, type RowDecision } from "@/server/import/excel";
import { toFormState } from "@/server/actions";

const DECISIONS = new Set<RowDecision>(["approve", "pending", "skip"]);

export async function commitImportAction(jobId: string, fd: FormData) {
  let error: string | undefined;
  try {
    const user = await authorize("question.import");
    const decisions: Record<number, RowDecision> = {};
    for (const [key, value] of fd.entries()) {
      const m = /^decision\.(\d+)$/.exec(key);
      if (m && DECISIONS.has(value as RowDecision)) decisions[Number(m[1])] = value as RowDecision;
    }
    await commitImport(jobId, "valid", user, decisions, { canApprove: await userCan(user, "question.autoApprove") });
    revalidatePath("/admin/preguntas");
  } catch (err) {
    error = toFormState(err)?.error;
  }
  redirect(`/admin/importar/${jobId}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function discardImportAction(jobId: string) {
  const user = await authorize("question.import");
  await discardImport(jobId, user);
  redirect("/admin/importar");
}
