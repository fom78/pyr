"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { signInAction } from "../actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, null);
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <Field label="Usuario" name="username" autoComplete="username" required defaultValue={state?.values?.username} autoFocus />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      {next && <input type="hidden" name="next" value={next} />}
      <SubmitButton size="lg" pendingText="Ingresando…">
        Ingresar
      </SubmitButton>
    </form>
  );
}
