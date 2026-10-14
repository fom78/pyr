"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FieldErrors, FormError } from "@/components/forms/field";
import { ImageUpload } from "@/components/forms/image-upload";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { tournamentTimeline } from "@/server/tournaments/timeline";
import { DEFAULT_TZ, formatDate, fromDateTimeInput } from "@/lib/format";
import { saveTournamentAction } from "./actions";

export type TournamentFormValues = {
  name: string;
  slug: string;
  description: string;
  imageKey: string | null;
  imageUrl: string | null;
  categoryIds: string[];
  startsAt: string; // datetime-local en hora de Buenos Aires
  quizCount: number;
  frequencyHours: number;
  quizActiveHours: number;
  registrationLeadDays: number;
  lateEntryDays: number;
  questionsPerQuiz: number;
  autoQuizzes: boolean;
  repeatEveryDays: number | null;
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

const PRESET_HOURS = [12, 24, 48];

export function TournamentForm({
  id,
  initial,
  categories,
  started,
  now,
}: {
  id: string | null;
  initial: TournamentFormValues;
  categories: { id: string; name: string; icon: string | null }[];
  /** Ya empezó: los tiempos quedan bloqueados. */
  started?: boolean;
  /** Instante de render (ISO), para la vista previa. */
  now: string;
}) {
  const [state, action] = useActionState(saveTournamentAction.bind(null, id), null);
  const fe = state?.fieldErrors;
  const v = state?.values;
  const num = (k: keyof TournamentFormValues) => String(v?.[k] ?? initial[k] ?? "");
  const [startsAt, setStartsAt] = useState(v?.startsAt ?? initial.startsAt);
  const [quizCount, setQuizCount] = useState(num("quizCount"));
  const [freq, setFreq] = useState(num("frequencyHours"));
  const [active, setActive] = useState(num("quizActiveHours"));
  const [lead, setLead] = useState(num("registrationLeadDays"));
  const [late, setLate] = useState(num("lateEntryDays"));

  const preview = useMemo(() => {
    const t = {
      startsAt: fromDateTimeInput(startsAt, DEFAULT_TZ),
      quizCount: Number(quizCount),
      frequencyHours: Number(freq),
      quizActiveHours: Number(active),
      registrationLeadDays: Number(lead),
      lateEntryDays: Number(late),
    };
    const ok =
      !Number.isNaN(t.startsAt.getTime()) &&
      [t.quizCount, t.frequencyHours, t.quizActiveHours].every((n) => Number.isInteger(n) && n > 0) &&
      [t.registrationLeadDays, t.lateEntryDays].every((n) => Number.isInteger(n) && n >= 0) &&
      t.quizCount <= 100;
    return ok ? tournamentTimeline(t, new Date(now)) : null;
  }, [startsAt, quizCount, freq, active, lead, late, now]);
  const d = (x: Date) => formatDate(x, DEFAULT_TZ, "EEE d/M HH:mm");
  const span = Number(active) / Number(freq);

  return (
    <form action={action} className="grid gap-6">
      <FormError message={state?.error} />
      {state?.message && <p className="bg-success/10 text-success rounded-md px-3 py-2 text-sm">{state.message}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" name="name" required defaultValue={v?.name ?? initial.name} errors={fe?.name} />
          <Field label="Identificador (slug)" name="slug" defaultValue={v?.slug ?? initial.slug} errors={fe?.slug} hint="Vacío = se genera del nombre." />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" name="description" defaultValue={v?.description ?? initial.description} maxLength={3000} />
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
            <p className="text-muted-foreground text-xs">Las preguntas de los cuestionarios salen del banco de estas categorías.</p>
            <FieldErrors errors={fe?.categoryIds} />
          </fieldset>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calendario</CardTitle>
          <CardDescription>
            Cargás cuándo empieza y el resto se calcula (hora de Buenos Aires).
            {started && " El torneo ya empezó: los tiempos no se pueden cambiar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="startsAt">Empieza (primer cuestionario)</Label>
              <Input readOnly={started} id="startsAt" name="startsAt" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              <FieldErrors errors={fe?.startsAt} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="quizCount">Cuestionarios</Label>
              <Input readOnly={started} id="quizCount" name="quizCount" type="number" min={1} max={100} required value={quizCount} onChange={(e) => setQuizCount(e.target.value)} />
              <FieldErrors errors={fe?.quizCount} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="frequencyHours">Uno cada (horas)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly={started} id="frequencyHours" name="frequencyHours" type="number" min={1} required value={freq} onChange={(e) => setFreq(e.target.value)} className="w-24" />
                {!started && PRESET_HOURS.map((h) => (
                  <Button key={h} type="button" size="sm" variant={Number(freq) === h ? "secondary" : "outline"} onClick={() => setFreq(String(h))}>
                    {h} h
                  </Button>
                ))}
              </div>
              <FieldErrors errors={fe?.frequencyHours} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="quizActiveHours">Cada uno queda abierto (horas)</Label>
              <Input readOnly={started} id="quizActiveHours" name="quizActiveHours" type="number" min={1} max={168} required value={active} onChange={(e) => setActive(e.target.value)} />
              <p className="text-muted-foreground text-xs">
                {span > 1 ? `Hay hasta ${Math.ceil(span)} abiertos a la vez.` : "Uno abierto por vez: hay que jugarlo en su turno."}
              </p>
              <FieldErrors errors={fe?.quizActiveHours} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="registrationLeadDays">La inscripción abre (días antes de empezar)</Label>
              <Input readOnly={started} id="registrationLeadDays" name="registrationLeadDays" type="number" min={0} max={60} required value={lead} onChange={(e) => setLead(e.target.value)} />
              <p className="text-muted-foreground text-xs">0 = apenas se publica.</p>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="lateEntryDays">Se pueden sumar hasta (días después de empezar)</Label>
              <Input readOnly={started} id="lateEntryDays" name="lateEntryDays" type="number" min={0} max={60} required value={late} onChange={(e) => setLate(e.target.value)} />
              <p className="text-muted-foreground text-xs">0 = la inscripción cierra cuando empieza. Quien entra tarde ya perdió fechas.</p>
              <FieldErrors errors={fe?.lateEntryDays} />
            </div>
          </div>
          {preview && (
            <div className="bg-muted/40 grid gap-1.5 rounded-md border p-3 text-sm">
              <p>
                <strong>Inscripción:</strong> {Number(lead) === 0 ? "desde que se publica" : d(preview.registrationOpensAt)} →{" "}
                {d(preview.registrationEndsAt)}
              </p>
              <p>
                <strong>{preview.slots.length} cuestionarios:</strong> {d(preview.slots[0])}
                {preview.slots.length > 1 && <> … {d(preview.slots.at(-1)!)}</>}
              </p>
              <p>
                <strong>Termina:</strong> {d(preview.endsAt)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cuestionarios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-2 sm:col-span-2">
            <Switch id="autoQuizzes" name="autoQuizzes" defaultChecked={v ? v.autoQuizzes === "on" : initial.autoQuizzes} />
            <div className="grid gap-0.5">
              <Label htmlFor="autoQuizzes">Armarlos solos con el banco</Label>
              <p className="text-muted-foreground text-xs">
                Como en la liga: un borrador por turno con preguntas nuevas al azar de las categorías (si faltan, reutiliza viejas). Pasan por
                &quot;Por aprobar&quot; y, si nadie los revisa, se publican solos antes de abrir. Apagado: los cargás a mano.
              </p>
            </div>
          </div>
          <Field
            label="Preguntas por cuestionario"
            name="questionsPerQuiz"
            type="number"
            min={1}
            max={100}
            defaultValue={v?.questionsPerQuiz ?? initial.questionsPerQuiz}
            errors={fe?.questionsPerQuiz}
          />
          <Field
            label="Repetir cada (días)"
            name="repeatEveryDays"
            type="number"
            min={1}
            max={365}
            defaultValue={v?.repeatEveryDays ?? initial.repeatEveryDays ?? ""}
            hint="Ej. 7 = torneo semanal: cuando empieza, se crea solo la próxima edición con la misma configuración. Vacío = no se repite."
            errors={fe?.repeatEveryDays}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Inscripción, comodines y premios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Costo (créditos)" name="entryCost" type="number" min={0} defaultValue={v?.entryCost ?? initial.entryCost} hint="No se puede cambiar cuando ya hay inscriptos." />
          <Field label="Cupo máximo (opcional)" name="maxParticipants" type="number" min={2} defaultValue={v?.maxParticipants ?? initial.maxParticipants ?? ""} />
          <Field label="Comodines por cuestionario" name="wildcardsPerQuiz" type="number" min={0} max={3} defaultValue={v?.wildcardsPerQuiz ?? initial.wildcardsPerQuiz} />
          <div />
          {WILDCARDS.map((w) => (
            <Field
              key={w.type}
              label={`${w.name}: usos por participante`}
              name={`wc.${w.type}`}
              type="number"
              min={0}
              defaultValue={v?.[`wc.${w.type}`] ?? initial.wildcards[w.type] ?? 0}
              hint="0 = deshabilitado"
            />
          ))}
          <Field
            label="Premios en créditos por puesto"
            name="prizes"
            defaultValue={v?.prizes ?? initial.prizes}
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
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Puntos base" name="base" type="number" min={0} defaultValue={v?.base ?? initial.base} />
          <Field label="Bonus velocidad" name="timeBonus" type="number" min={0} defaultValue={v?.timeBonus ?? initial.timeBonus} />
          <Field label="Penalización" name="wrongPenalty" type="number" min={0} defaultValue={v?.wrongPenalty ?? initial.wrongPenalty} />
        </CardContent>
      </Card>
      <div>
        <SubmitButton pendingText="Guardando…">{id ? "Guardar cambios" : "Crear torneo"}</SubmitButton>
      </div>
    </form>
  );
}
