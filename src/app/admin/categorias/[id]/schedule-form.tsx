"use client";

import { useActionState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { UnsavedBadge, useUnsavedChanges } from "@/components/forms/unsaved-changes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveScheduleAction } from "../actions";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

export type ScheduleInitial = {
  enabled: boolean;
  weekdays: number[];
  timeOfDay: string;
  titleTemplate: string;
  difficultyMix: Record<string, number> | null;
  timeMode: "PER_QUESTION" | "TOTAL";
};

export function ScheduleForm({
  categoryId,
  initial,
  questionCount,
  children,
}: {
  categoryId: string;
  initial: ScheduleInitial | null;
  questionCount: number;
  /** Vista previa de turnos y cobertura (se renderiza en el servidor). */
  children?: React.ReactNode;
}) {
  const [state, action] = useActionState(saveScheduleAction.bind(null, categoryId), null);
  const fe = state?.fieldErrors;
  const { ref, dirty } = useUnsavedChanges(state);
  const days = new Set(initial?.weekdays ?? []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendario automático</CardTitle>
        <CardDescription>
          El sistema genera por adelantado un borrador con {questionCount} preguntas aprobadas para cada turno. Un admin o mod lo
          revisa y lo aprueba; las preguntas nunca usadas tienen prioridad.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form ref={ref} action={action} className="grid gap-4">
          <FormError message={state?.error} />
          <div className="flex items-center gap-2">
            <Switch id="enabled" name="enabled" defaultChecked={initial?.enabled ?? true} />
            <Label htmlFor="enabled">Habilitado</Label>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Días</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label
                  key={d.value}
                  className="has-checked:bg-accent flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d.value}
                    defaultChecked={days.has(d.value)}
                    className="accent-primary"
                  />
                  {d.label}
                </label>
              ))}
            </div>
            {fe?.weekdays?.map((e) => (
              <p key={e} className="text-destructive text-sm">
                {e}
              </p>
            ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Hora de apertura"
              name="timeOfDay"
              type="time"
              required
              defaultValue={initial?.timeOfDay ?? "20:00"}
              errors={fe?.timeOfDay}
            />
            <div className="grid content-start gap-1.5">
              <Label htmlFor="timeMode">Modo de tiempo</Label>
              <NativeSelect id="timeMode" name="timeMode" defaultValue={initial?.timeMode ?? "PER_QUESTION"}>
                <option value="PER_QUESTION">Tiempo por pregunta</option>
                <option value="TOTAL">Tiempo total</option>
              </NativeSelect>
            </div>
            <Field
              className="sm:col-span-2"
              label="Plantilla de título"
              name="titleTemplate"
              required
              defaultValue={initial?.titleTemplate ?? "{categoria} · {fecha}"}
              hint="Variables: {categoria}, {fecha}, {n} (número de cuestionario)."
              errors={fe?.titleTemplate}
            />
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Mezcla de dificultad (opcional)</legend>
            <div className="flex flex-wrap gap-3">
              {["1", "2", "3", "4", "5"].map((d) => (
                <label key={d} className="text-muted-foreground grid gap-1 text-xs">
                  Dificultad {d}
                  <input
                    type="number"
                    name={`mix.${d}`}
                    min={0}
                    max={questionCount}
                    defaultValue={initial?.difficultyMix?.[d] ?? ""}
                    className="text-foreground h-9 w-20 rounded-md border bg-transparent px-2 text-sm"
                  />
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Cantidad de preguntas de cada dificultad. Lo que falte se completa con cualquier dificultad. Vacío = sin
              restricción.
            </p>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Guardando…">Guardar calendario</SubmitButton>
            <UnsavedBadge dirty={dirty} />
            {!dirty && state?.message && <span className="text-success text-sm">{state.message}</span>}
          </div>
        </form>
        {children}
      </CardContent>
    </Card>
  );
}
