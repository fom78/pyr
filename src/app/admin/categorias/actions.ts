"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { saveCategory } from "@/server/categories/service";
import { saveSchedule } from "@/server/autoquiz/service";
import { formValues, toFormState, type FormState } from "@/server/actions";

export async function saveCategoryAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let savedId: string;
  try {
    const user = await authorize("category.manage");
    const settings: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("settings.")) settings[k.slice(9)] = v;
    const cat = await saveCategory(
      id,
      {
        name: fd.get("name"),
        slug: fd.get("slug") || undefined,
        description: fd.get("description") || undefined,
        icon: fd.get("icon") || undefined,
        imageKey: fd.get("imageKey") || undefined,
        active: fd.get("active") === "on",
        settings,
      },
      user,
    );
    savedId = cat.id;
    revalidatePath("/admin/categorias");
    revalidatePath(`/admin/categorias/${cat.id}`);
  } catch (err) {
    return toFormState(err, values);
  }
  // Al editar se queda en la página (para seguir con el calendario); una nueva va a su edición.
  if (!id) redirect(`/admin/categorias/${savedId}`);
  return { ok: true, message: "Categoría guardada." };
}

export async function saveScheduleAction(categoryId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const user = await authorize("schedule.manage");
    const mix: Record<string, number> = {};
    for (const d of ["1", "2", "3", "4", "5"]) {
      const n = Number(fd.get(`mix.${d}`) || 0);
      if (n > 0) mix[d] = n;
    }
    const { discarded } = await saveSchedule(
      categoryId,
      {
        enabled: fd.get("enabled") === "on",
        anchorAt: fd.get("anchorAt"),
        frequencyHours: fd.get("frequencyHours"),
        excludedWeekdays: fd.getAll("excludedWeekdays").map(Number),
        titleTemplate: fd.get("titleTemplate"),
        difficultyMix: Object.keys(mix).length ? mix : null,
        timeMode: fd.get("timeMode"),
      },
      user,
    );
    revalidatePath(`/admin/categorias/${categoryId}`);
    revalidatePath("/admin/cuestionarios/por-aprobar");
    return {
      ok: true,
      message: discarded
        ? `Calendario guardado. Se descartaron ${discarded} borrador(es) que ya no coinciden.`
        : "Calendario guardado.",
    };
  } catch (err) {
    return toFormState(err, values);
  }
}
