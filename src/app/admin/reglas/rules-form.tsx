"use client";

import { useActionState } from "react";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveRulesAction } from "./actions";

export function RulesForm({ sections, texts }: { sections: Record<string, string>; texts: Record<string, string> }) {
  const [state, action] = useActionState(saveRulesAction, null);
  return (
    <form action={action} className="grid gap-5">
      <FormError message={state?.error} />
      {state?.message && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>}
      {Object.entries(sections).map(([key, label]) => (
        <div key={key} className="grid gap-1.5">
          <Label htmlFor={`r-${key}`}>{label}</Label>
          <Textarea id={`r-${key}`} name={key} defaultValue={texts[key]} rows={5} maxLength={4000} />
          <p className="text-xs text-muted-foreground">Separá párrafos con una línea en blanco.</p>
        </div>
      ))}
      <SubmitButton className="w-fit" pendingText="Guardando…">
        Guardar textos
      </SubmitButton>
    </form>
  );
}
