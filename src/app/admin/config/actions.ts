"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/guard";
import { getSettings, setSetting } from "@/server/config/service";
import { settingKeys, settingsRegistry, type SettingKey } from "@/server/config/registry";
import { logAudit } from "@/server/audit";
import { toFormState, type FormState } from "@/server/actions";

function coerce(key: SettingKey, raw: FormDataEntryValue[]) {
  const def = settingsRegistry[key].default;
  if (typeof def === "boolean") return raw.map(String).includes("true");
  if (typeof def === "number") return Number(raw[0]);
  return String(raw[0]);
}

export async function saveConfigAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const actor = await authorize("settings.manage");
    const current = await getSettings();
    const fieldErrors: Record<string, string[]> = {};
    const changes: { key: SettingKey; before: unknown; after: unknown }[] = [];
    for (const key of settingKeys) {
      const raw = fd.getAll(key);
      if (!raw.length) continue;
      const value = coerce(key, raw);
      const parsed = settingsRegistry[key].schema.safeParse(value);
      if (!parsed.success) {
        fieldErrors[key] = parsed.error.issues.map((i) => i.message);
        continue;
      }
      if (parsed.data !== current[key]) changes.push({ key, before: current[key], after: parsed.data });
    }
    if (Object.keys(fieldErrors).length) return { ok: false, error: "Hay valores inválidos.", fieldErrors };
    for (const c of changes) await setSetting(c.key, c.after, actor.id);
    if (changes.length)
      await logAudit({
        actorId: actor.id,
        action: "settings.update",
        entityType: "AppSetting",
        before: Object.fromEntries(changes.map((c) => [c.key, c.before])),
        after: Object.fromEntries(changes.map((c) => [c.key, c.after])),
      });
    revalidatePath("/", "layout");
    return { ok: true, message: changes.length ? `Se guardaron ${changes.length} cambio(s).` : "No había cambios." };
  } catch (err) {
    return toFormState(err);
  }
}
