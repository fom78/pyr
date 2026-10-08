"use client";

import { useActionState } from "react";
import { Field, FieldErrors, FormError } from "@/components/forms/field";
import { ImageUpload } from "@/components/forms/image-upload";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTournamentAction } from "./actions";

export type TournamentFormValues = {
  name: string;
  slug: string;
  description: string;
  imageKey: string | null;
  imageUrl: string | null;
  categoryIds: string[];
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationEndsAt: string;
  quizCount: number;
  frequencyDays: number;
  entryCost: number;
  maxParticipants: number | null;
  wildcardsPerQuiz: number;
  wildcards: Record<string, number>;
  prizes: string; // "150, 75, 30"
  base: number;
  timeBonus: number;
  wrongPenalty: number;
};

const WILDCARDS = [
  { type: "DOUBLE_TOTAL", name: "Doble total" },
  { type: "DOUBLE_PER_CORRECT", name: "Doble por acierto" },
  { type: "TRIPLE_SURPRISE", name: "Triple sorpresa" },
];

export function TournamentForm({
  id,
  initial,
  categories,
  timezone,
}: {
  id: string | null;
  initial: TournamentFormValues;
  categories: { id: string; name: string; icon: string | null }[];
  timezone: string;
}) {
  const [state, action] = useActionState(saveTournamentAction.bind(null, id), null);
  const fe = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-6">
      <FormError message={state?.error} />
      {state?.message && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="name" required defaultValue={initial.name} errors={fe?.name} />
          <Field label="Identificador (slug)" name="slug" defaultValue={initial.slug} errors={fe?.slug} hint="Vacío = se genera del nombre." />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" name="description" defaultValue={initial.description} maxLength={3000} />
          </div>
          <div className="grid gap-1.5">
            <Label>Imagen</Label>
            <ImageUpload name="imageKey" preset="cover" defaultKey={initial.imageKey} defaultUrl={initial.imageUrl} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Categorías</legend>
            <div className="flex flex-wrap gap-3">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={initial.categoryIds.includes(c.id)} className="size-4" />
                  {c.icon} {c.name}
                </label>
              ))}
            </div>
            <FieldErrors errors={fe?.categoryIds} />
          </fieldset>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Fechas</CardTitle>
          <CardDescription>Horario de {timezone.replace(/_/g, " ")}. Los cuestionarios del torneo deben abrir y cerrar dentro de la vigencia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Empieza" name="startsAt" type="datetime-local" required defaultValue={initial.startsAt} />
          <Field label="Termina" name="endsAt" type="datetime-local" required defaultValue={initial.endsAt} errors={fe?.endsAt} />
          <Field label="Abre la inscripción" name="registrationOpensAt" type="datetime-local" required defaultValue={initial.registrationOpensAt} />
          <Field
            label="Cierra la inscripción"
            name="registrationEndsAt"
            type="datetime-local"
            required
            defaultValue={initial.registrationEndsAt}
            errors={fe?.registrationEndsAt}
          />
          <Field label="Cantidad de cuestionarios" name="quizCount" type="number" min={1} defaultValue={initial.quizCount} />
          <Field label="Frecuencia (cada X días)" name="frequencyDays" type="number" min={1} defaultValue={initial.frequencyDays} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Inscripción, comodines y premios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Costo (créditos)" name="entryCost" type="number" min={0} defaultValue={initial.entryCost} hint="No se puede cambiar cuando ya hay inscriptos." />
          <Field label="Cupo máximo (opcional)" name="maxParticipants" type="number" min={2} defaultValue={initial.maxParticipants ?? ""} />
          <Field label="Comodines por cuestionario" name="wildcardsPerQuiz" type="number" min={0} max={3} defaultValue={initial.wildcardsPerQuiz} />
          <div />
          {WILDCARDS.map((w) => (
            <Field
              key={w.type}
              label={`${w.name}: usos por participante`}
              name={`wc.${w.type}`}
              type="number"
              min={0}
              defaultValue={initial.wildcards[w.type] ?? 0}
              hint="0 = deshabilitado"
            />
          ))}
          <Field
            label="Premios en créditos por puesto"
            name="prizes"
            defaultValue={initial.prizes}
            placeholder="150, 75, 30"
            hint="Separados por coma: 1° puesto, 2°, 3°…"
            errors={fe?.prizes}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Puntaje de los cuestionarios</CardTitle>
          <CardDescription>Valores por defecto para los cuestionarios que se generen para este torneo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Puntos base" name="base" type="number" min={0} defaultValue={initial.base} />
          <Field label="Bonus velocidad" name="timeBonus" type="number" min={0} defaultValue={initial.timeBonus} />
          <Field label="Penalización" name="wrongPenalty" type="number" min={0} defaultValue={initial.wrongPenalty} />
        </CardContent>
      </Card>
      <div>
        <SubmitButton pendingText="Guardando…">{id ? "Guardar cambios" : "Crear torneo"}</SubmitButton>
      </div>
    </form>
  );
}
