"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { signUpAction } from "../actions";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, null);
  const fe = state?.fieldErrors;
  const v = state?.values;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <Field
        label="Usuario"
        name="username"
        autoComplete="username"
        required
        defaultValue={v?.username}
        errors={fe?.username}
        hint="Letras, números, punto o guion bajo (3 a 24)."
      />
      <Field label="Nombre visible (opcional)" name="name" autoComplete="nickname" defaultValue={v?.name} errors={fe?.name} />
      <Field
        label="Email (opcional)"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={v?.email}
        errors={fe?.email}
        hint="Sirve para vincular tu cuenta de Google más adelante."
      />
      <Field label="Contraseña" name="password" type="password" autoComplete="new-password" required minLength={8} errors={fe?.password} />
      <Field label="Repetir contraseña" name="confirm" type="password" autoComplete="new-password" required errors={fe?.confirm} />
      <SubmitButton size="lg" pendingText="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}
