"use client";

import { useActionState, useState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { ImageUpload } from "@/components/forms/image-upload";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createTicketAction } from "../actions";

const TYPES = [
  { value: "BUG", label: "Algo no funciona", hint: "Un error, algo que se ve mal o no responde." },
  { value: "SUGGESTION", label: "Sugerencia", hint: "Una idea o mejora para el juego." },
  { value: "OTHER", label: "Otro", hint: "Cualquier otra consulta." },
] as const;

const PLACEHOLDER: Record<string, string> = {
  BUG: "¿Qué estabas haciendo? ¿Qué esperabas que pasara? ¿Qué pasó en cambio?",
  SUGGESTION: "¿Qué te gustaría que cambie o que se agregue? ¿Por qué?",
  OTHER: "Contanos.",
};

export function NewTicketForm({ pageUrl, defaultType }: { pageUrl: string | null; defaultType: "BUG" | "SUGGESTION" }) {
  const [state, action] = useActionState(createTicketAction, null);
  const fe = state?.fieldErrors;
  const [type, setType] = useState<string>(state?.values?.type ?? defaultType);
  return (
    <Card>
      <CardContent className="py-5">
        <form action={action} className="grid gap-5">
          <FormError message={state?.error} />
          {pageUrl && <input type="hidden" name="pageUrl" value={pageUrl} />}
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">¿Qué querés contarnos?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    "has-checked:border-primary has-checked:bg-primary/5 grid cursor-pointer gap-0.5 rounded-lg border p-3 text-sm",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="type"
                      value={t.value}
                      checked={type === t.value}
                      onChange={() => setType(t.value)}
                      className="accent-primary"
                    />
                    {t.label}
                  </span>
                  <span className="text-muted-foreground text-xs">{t.hint}</span>
                </label>
              ))}
            </div>
            {fe?.type?.map((e) => (
              <p key={e} className="text-destructive text-sm">
                {e}
              </p>
            ))}
          </fieldset>
          <Field label="Título" name="title" required maxLength={120} defaultValue={state?.values?.title} errors={fe?.title} placeholder="En pocas palabras" />
          <div className="grid gap-1.5">
            <Label htmlFor="body">Descripción</Label>
            <Textarea
              id="body"
              name="body"
              required
              rows={6}
              maxLength={4000}
              placeholder={PLACEHOLDER[type]}
              defaultValue={state?.values?.body}
              aria-invalid={fe?.body ? true : undefined}
            />
            {fe?.body?.map((e) => (
              <p key={e} className="text-destructive text-sm">
                {e}
              </p>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label>Captura de pantalla (opcional)</Label>
            <ImageUpload name="imageKey" preset="ticket" label="Adjuntar captura" />
          </div>
          {pageUrl && <p className="text-muted-foreground text-xs">Se adjunta la página desde la que venías: {pageUrl}</p>}
          <div>
            <SubmitButton pendingText="Enviando…">Enviar</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
