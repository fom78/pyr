"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { UnsavedBadge, useUnsavedChanges } from "@/components/forms/unsaved-changes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { gridSlots } from "@/server/autoquiz/slots";
import { DEFAULT_TZ, formatDate, fromDateTimeInput } from "@/lib/format";
import { cn } from "@/lib/utils";
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

const PRESET_HOURS = [12, 24, 36, 48];
const PREVIEW = 8;

export type ScheduleInitial = {
  enabled: boolean;
  anchorAt: string; // datetime-local en hora de Buenos Aires
  frequencyHours: number;
  excludedWeekdays: number[];
  titleTemplate: string;
  difficultyMix: Record<string, number> | null;
  timeMode: "PER_QUESTION" | "TOTAL";
};

export function ScheduleForm({
  categoryId,
  initial,
  questionCount,
  activeHours,
  defaultAnchor,
  now,
  children,
}: {
  categoryId: string;
  initial: ScheduleInitial | null;
  questionCount: number;
  /** Validez de cada cuestionario (config de la categoría), para estimar cuántos hay abiertos a la vez. */
  activeHours: number;
  defaultAnchor: string;
  /** Instante de render (ISO) para la vista previa de turnos. */
  now: string;
  /** Vista previa de turnos y cobertura (se renderiza en el servidor). */
  children?: React.ReactNode;
}) {
  const [state, action] = useActionState(saveScheduleAction.bind(null, categoryId), null);
  const fe = state?.fieldErrors;
  const { ref, dirty } = useUnsavedChanges(state);
  const [anchor, setAnchor] = useState(initial?.anchorAt ?? defaultAnchor);
  const [freq, setFreq] = useState(String(initial?.frequencyHours ?? 24));
  const [excluded, setExcluded] = useState<number[]>(initial?.excludedWeekdays ?? []);

  const hours = Number(freq);
  const preview = useMemo(() => {
    const anchorAt = fromDateTimeInput(anchor, DEFAULT_TZ);
    if (!Number.isInteger(hours) || hours < 1 || Number.isNaN(anchorAt.getTime())) return [];
    const from = new Date(Math.max(Date.parse(now), anchorAt.getTime() - 1));
    const s = { anchorAt, frequencyHours: hours, excludedWeekdays: excluded, timezone: DEFAULT_TZ };
    return gridSlots(s, from, new Date(from.getTime() + Math.max(hours * PREVIEW, 24 * 14) * 3_600_000)).slice(0, PREVIEW);
  }, [anchor, hours, excluded, now]);
  const open = Number.isInteger(hours) && hours > 0 ? activeHours / hours : 0;

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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="anchorAt">Primer turno</Label>
              <Input
                id="anchorAt"
                name="anchorAt"
                type="datetime-local"
                required
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Hora de Buenos Aires. Los demás turnos salen de sumarle la frecuencia, así la grilla es siempre la misma.
              </p>
              {fe?.anchorAt?.map((e) => (
                <p key={e} className="text-destructive text-sm">
                  {e}
                </p>
              ))}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="frequencyHours">Frecuencia (horas)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="frequencyHours"
                  name="frequencyHours"
                  type="number"
                  min={1}
                  max={336}
                  required
                  value={freq}
                  onChange={(e) => setFreq(e.target.value)}
                  className="w-24"
                />
                {PRESET_HOURS.map((h) => (
                  <Button
                    key={h}
                    type="button"
                    size="sm"
                    variant={hours === h ? "secondary" : "outline"}
                    onClick={() => setFreq(String(h))}
                  >
                    {h} h
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Cada cuestionario queda abierto {activeHours} h
                {open > 0 && <> → unos {Number.isInteger(open) ? open : open.toFixed(1)} abiertos a la vez</>}.
              </p>
              {fe?.frequencyHours?.map((e) => (
                <p key={e} className="text-destructive text-sm">
                  {e}
                </p>
              ))}
            </div>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Días sin publicar</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label
                  key={d.value}
                  className="has-checked:bg-destructive/10 has-checked:text-destructive flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="excludedWeekdays"
                    value={d.value}
                    checked={excluded.includes(d.value)}
                    onChange={(e) =>
                      setExcluded((prev) => (e.target.checked ? [...prev, d.value] : prev.filter((x) => x !== d.value)))
                    }
                    className="accent-destructive"
                  />
                  {d.label}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Un turno que cae en uno de estos días (hora de Buenos Aires) no se publica; los siguientes no se corren.
            </p>
            {fe?.excludedWeekdays?.map((e) => (
              <p key={e} className="text-destructive text-sm">
                {e}
              </p>
            ))}
          </fieldset>
          {preview.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">Próximos turnos con esta configuración</p>
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {preview.map((p) => (
                  <li
                    key={p.at.toISOString()}
                    className={cn(
                      "rounded-md border px-2 py-1 tabular-nums",
                      p.excluded && "text-muted-foreground line-through opacity-60",
                    )}
                    title={p.excluded ? "Día sin publicar" : undefined}
                  >
                    {formatDate(p.at, DEFAULT_TZ, "EEE d/M HH:mm")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="timeMode">Modo de tiempo</Label>
              <NativeSelect id="timeMode" name="timeMode" defaultValue={initial?.timeMode ?? "PER_QUESTION"}>
                <option value="PER_QUESTION">Tiempo por pregunta</option>
                <option value="TOTAL">Tiempo total</option>
              </NativeSelect>
            </div>
            <Field
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
