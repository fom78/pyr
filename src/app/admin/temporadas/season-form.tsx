"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { ImageUpload } from "@/components/forms/image-upload";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSeasonAction } from "./actions";

export function SeasonForm({
  id,
  initial,
}: {
  id: string | null;
  initial: { name: string; description: string; imageKey: string | null; imageUrl: string | null; repeatAfterDays: number | null };
}) {
  const [state, action] = useActionState(saveSeasonAction.bind(null, id), null);
  const fe = state?.fieldErrors;
  const v = state?.values;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      {state?.message && <p className="bg-success/10 text-success rounded-md px-3 py-2 text-sm">{state.message}</p>}
      <Field label="Nombre" name="name" required defaultValue={v?.name ?? initial.name} errors={fe?.name} hint="Ej. «Temporada Otoño». Cada instancia suma «#1», «#2»…" />
      <div className="grid gap-1.5">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Textarea id="description" name="description" defaultValue={v?.description ?? initial.description} maxLength={3000} />
        <p className="text-muted-foreground text-xs">Se usa en los torneos que no tengan una propia.</p>
      </div>
      {id && (
        <div className="grid gap-1.5">
          <Label>Imagen (opcional)</Label>
          <ImageUpload name="imageKey" preset="cover" defaultKey={initial.imageKey} defaultUrl={initial.imageUrl} />
        </div>
      )}
      <Field
        label="Repetir: la siguiente empieza N días después de que termina (opcional)"
        name="repeatAfterDays"
        type="number"
        min={0}
        max={365}
        defaultValue={v?.repeatAfterDays ?? initial.repeatAfterDays ?? ""}
        errors={fe?.repeatAfterDays}
        hint="Ej. 7: una semana de descanso entre instancias. Se lanza sola con anticipación para que su inscripción abra a tiempo. Vacío = no se repite (la podés relanzar a mano)."
      />
      <div>
        <SubmitButton pendingText="Guardando…">{id ? "Guardar" : "Crear temporada"}</SubmitButton>
      </div>
    </form>
  );
}
