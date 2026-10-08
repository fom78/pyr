"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { rulesSections } from "@/server/rules/defaults";
import { logAudit } from "@/server/audit";
import { toFormState, type FormState } from "@/server/actions";

export async function saveRulesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await authorize("rules.edit");
    for (const section of Object.keys(rulesSections)) {
      const content = String(fd.get(section) ?? "").trim().slice(0, 4000);
      if (!content) continue;
      await prisma.rulesText.upsert({ where: { section }, create: { section, content }, update: { content } });
    }
    await logAudit({ actorId: actor.id, action: "rules.update", entityType: "RulesText" });
    revalidatePath("/como-se-juega");
    return { ok: true, message: "Textos guardados." };
  } catch (err) {
    return toFormState(err);
  }
}
