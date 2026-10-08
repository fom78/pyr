"use client";

import { useActionState, useState } from "react";
import { Play } from "lucide-react";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { cn } from "@/lib/utils";
import { startQuizAction } from "../../actions";

type Wildcard = { type: string; name: string; description: string; example: string; remaining: number; total: number };

export function StartForm({ quizId, wildcards, maxWildcards }: { quizId: string; wildcards: Wildcard[]; maxWildcards: number }) {
  const [state, action] = useActionState(startQuizAction.bind(null, quizId), null);
  const [chosen, setChosen] = useState<string>("");
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      {maxWildcards > 0 && wildcards.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">¿Usás un comodín? (opcional)</legend>
          <label
            className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm", chosen === "" && "border-primary bg-primary/5")}
          >
            <input type="radio" name="wildcard" value="" checked={chosen === ""} onChange={() => setChosen("")} className="mt-0.5 size-4" />
            <span>Sin comodín</span>
          </label>
          {wildcards.map((w) => (
            <label
              key={w.type}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3 text-sm",
                w.remaining > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                chosen === w.type && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="wildcard"
                value={w.type}
                disabled={w.remaining === 0}
                checked={chosen === w.type}
                onChange={() => setChosen(w.type)}
                className="mt-0.5 size-4"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  🃏 {w.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({w.remaining} de {w.total} disponibles)
                  </span>
                </span>
                <span>{w.description}</span>
                <span className="text-muted-foreground">Ej.: {w.example}</span>
              </span>
            </label>
          ))}
          {chosen && <p className="text-sm text-warning-foreground dark:text-warning">Una vez que empieces, el comodín se gasta y no se recupera.</p>}
        </fieldset>
      )}
      <SubmitButton size="lg" className="h-12 text-base" pendingText="Preparando…">
        <Play /> Empezar ahora
      </SubmitButton>
    </form>
  );
}
