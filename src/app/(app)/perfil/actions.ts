"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { getCurrentUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { formValues, toFormState, type FormState } from "@/server/actions";

const TIMEZONES = ["America/Argentina/Buenos_Aires", "America/Montevideo", "America/Santiago", "America/Sao_Paulo", "America/Mexico_City", "America/Bogota", "America/Lima", "Europe/Madrid", "UTC"] as const;

const profileSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres.").max(40),
  timezone: z.enum(TIMEZONES),
  image: z.string().trim().max(300).optional(),
});

async function me() {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Tu sesión expiró.", "UNAUTHENTICATED", 401);
  return user;
}

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const user = await me();
    const data = profileSchema.parse({ name: fd.get("name"), timezone: fd.get("timezone"), image: fd.get("image") || undefined });
    await prisma.user.update({ where: { id: user.id }, data: { name: data.name, timezone: data.timezone, image: data.image ?? user.image } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Perfil actualizado." };
  } catch (err) {
    return toFormState(err, values);
  }
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresá tu contraseña actual."),
    newPassword: z.string().min(8, "Mínimo 8 caracteres.").max(128),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden." });

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await me();
    const data = passwordSchema.parse(Object.fromEntries(fd));
    await auth.api.changePassword({
      body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
    return { ok: true, message: "Contraseña actualizada. Cerramos tus otras sesiones." };
  } catch (err) {
    return toFormState(err);
  }
}

