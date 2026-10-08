"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, USERNAME_RE } from "@/server/auth/auth";
import { formValues, toFormState, type FormState } from "@/server/actions";

const signInSchema = z.object({
  username: z.string().trim().min(1, "Ingresá tu usuario."),
  password: z.string().min(1, "Ingresá tu contraseña."),
  next: z.string().optional(),
});

function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const data = signInSchema.parse(Object.fromEntries(fd));
    await auth.api.signInUsername({
      body: { username: data.username, password: data.password },
      headers: await headers(),
    });
    redirect(safeNext(data.next));
  } catch (err) {
    return toFormState(err, values);
  }
}

const signUpSchema = z
  .object({
    username: z.string().trim().regex(USERNAME_RE, "Entre 3 y 24 caracteres: letras, números, punto o guion bajo."),
    name: z.string().trim().max(40, "Máximo 40 caracteres.").optional(),
    email: z.union([z.literal(""), z.email("Email inválido.")]).optional(),
    password: z.string().min(8, "Mínimo 8 caracteres.").max(128),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden." });

export async function signUpAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const data = signUpSchema.parse(Object.fromEntries(fd));
    // El email es opcional: si no lo da, usamos uno interno no enrutable (Better Auth requiere email único).
    const email = data.email || `${data.username.toLowerCase()}@sin-email.invalid`;
    await auth.api.signUpEmail({
      body: { email, password: data.password, name: data.name || data.username, username: data.username },
      headers: await headers(),
    });
    redirect("/bienvenida");
  } catch (err) {
    return toFormState(err, values);
  }
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/ingresar");
}
