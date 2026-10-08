"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveQuizAction } from "./actions";

export type QuizFormValues = {
  title: string;
  description: string;
  ref: string; // "c:<categoryId>" | "t:<tournamentId>"
  opensAt: string;
  closesAt: string;
  expiresAt: string;
  timeMode: "PER_QUESTION" | "TOTAL";
  timeLimitSec: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  base: number;
  timeBonus: number;
  wrongPenalty: number;
};

type Props = {
  id: string | null;
  initial: QuizFormValues;
  refs: { value: string; label: string }[];
  /** DRAFT/SCHEDULED: todo editable. Abierto: solo título, cierre y vencimiento. */
  mode: "full" | "scheduled" | "opened";
  timezone: string;
};

export function QuizForm({ id, initial, refs, mode, timezone }: Props) {
  const [state, action] = useActionState(saveQuizAction.bind(null, id), null);
  const fe = state?.fieldErrors;
  const lockedAll = mode === "opened";
  const lockedScoring = mode !== "full";
  return (
    <form action={action} className="grid gap-6">
      <FormError message={state?.error} />
      {state?.message && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Título" name="title" required defaultValue={initial.title} errors={fe?.title} className="sm:col-span-2" />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea id="description" name="description" defaultValue={initial.description} maxLength={1000} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ref">Pertenece a</Label>
            <NativeSelect id="ref" name="ref" defaultValue={initial.ref} disabled={lockedAll} required>
              <option value="" disabled>
                Elegí una categoría o torneo…
              </option>
              {refs.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </NativeSelect>
            {lockedAll && <input type="hidden" name="ref" value={initial.ref} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vigencia</CardTitle>
          <CardDescription>
            Horario de {timezone.replace(/_/g, " ")}. Un cuestionario siempre tiene cierre: después pasa a “cerrado” (computa para la tabla) y al
            final a “historial”.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Abre" name="opensAt" type="datetime-local" required defaultValue={initial.opensAt} readOnly={lockedAll} />
          <Field label="Cierra" name="closesAt" type="datetime-local" required defaultValue={initial.closesAt} />
          <Field label="Deja de computar" name="expiresAt" type="datetime-local" required defaultValue={initial.expiresAt} />
        </CardContent>
      </Card>

      <fieldset disabled={lockedAll} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Juego</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="timeMode">Modo de tiempo</Label>
              <NativeSelect id="timeMode" name="timeMode" defaultValue={initial.timeMode}>
                <option value="PER_QUESTION">Tiempo por pregunta</option>
                <option value="TOTAL">Tiempo total del cuestionario</option>
              </NativeSelect>
            </div>
            <Field label="Segundos (por pregunta o total)" name="timeLimitSec" type="number" min={3} max={3600} required defaultValue={initial.timeLimitSec} errors={fe?.timeLimitSec} />
            <div className="flex items-center gap-2">
              <Switch id="shuffleQuestions" name="shuffleQuestions" defaultChecked={initial.shuffleQuestions} />
              <Label htmlFor="shuffleQuestions">Orden aleatorio de preguntas</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="shuffleOptions" name="shuffleOptions" defaultChecked={initial.shuffleOptions} />
              <Label htmlFor="shuffleOptions">Orden aleatorio de opciones</Label>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Puntaje</CardTitle>
            <CardDescription>
              Por acierto: base + bonus × (1 − tiempo usado / tiempo límite). Se congela al publicar
              {lockedScoring && " — ya no se puede cambiar"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Puntos base" name="base" type="number" min={0} defaultValue={initial.base} readOnly={lockedScoring} />
            <Field label="Bonus por velocidad" name="timeBonus" type="number" min={0} defaultValue={initial.timeBonus} readOnly={lockedScoring} />
            <Field label="Penalización por error" name="wrongPenalty" type="number" min={0} defaultValue={initial.wrongPenalty} readOnly={lockedScoring} />
          </CardContent>
        </Card>
      </fieldset>
      {lockedAll && (
        <>
          {/* los campos deshabilitados no se envían: mandamos los valores originales */}
          <input type="hidden" name="timeMode" value={initial.timeMode} />
          <input type="hidden" name="timeLimitSec" value={initial.timeLimitSec} />
          <input type="hidden" name="base" value={initial.base} />
          <input type="hidden" name="timeBonus" value={initial.timeBonus} />
          <input type="hidden" name="wrongPenalty" value={initial.wrongPenalty} />
          {initial.shuffleQuestions && <input type="hidden" name="shuffleQuestions" value="on" />}
          {initial.shuffleOptions && <input type="hidden" name="shuffleOptions" value="on" />}
        </>
      )}
      <div>
        <SubmitButton pendingText="Guardando…">{id ? "Guardar cambios" : "Crear cuestionario"}</SubmitButton>
      </div>
    </form>
  );
}
