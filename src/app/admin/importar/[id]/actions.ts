"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { commitImport, discardImport } from "@/server/import/excel";
import { toFormState } from "@/server/actions";

export async function commitImportAction(jobId: string, mode: "valid" | "all") {
  let error: string | undefined;
  try {
    const user = await authorize("question.import");
    await commitImport(jobId, mode, user);
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
