"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { saveCategory } from "@/server/categories/service";
import { formValues, toFormState, type FormState } from "@/server/actions";

export async function saveCategoryAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const user = await authorize("category.manage");
    const settings: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("settings.")) settings[k.slice(9)] = v;
    await saveCategory(
      id,
      {
        name: fd.get("name"),
        slug: fd.get("slug") || undefined,
        description: fd.get("description") || undefined,
        icon: fd.get("icon") || undefined,
        imageKey: fd.get("imageKey") || undefined,
        active: fd.get("active") === "on",
        frequencyDays: fd.get("frequencyDays") ? Number(fd.get("frequencyDays")) : null,
        settings,
      },
      user,
    );
    revalidatePath("/admin/categorias");
  } catch (err) {
    return toFormState(err, values);
  }
  redirect("/admin/categorias");
}
