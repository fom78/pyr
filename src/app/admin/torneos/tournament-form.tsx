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
import { BRACKET_SIZES, bracketQuestionNeed, roundsFor } from "@/server/tournaments/bracket";
import { DEFAULT_TZ, formatDate, fromDateTimeInput } from "@/lib/format";
import { saveTournamentAction } from "./actions";
import { saveStageAction } from "../temporadas/actions";
import { daysBetween, localDay, stageStart } from "@/server/seasons/plan";

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
  prizeStars: string; // "5, 2"
  base: number;
  timeBonus: number;
  wrongPenalty: number;
  format: "POINTS" | "KNOCKOUT";
  seeding: "QUALIFICATION" | "RANDOM";
  autoConfirmQualified: boolean;
  thirdPlaceMatch: boolean;
  questionSource: "NEW_FIRST" | "REUSED_FIRST";
  uniqueQuestions: number | null;
  qualifiers: { sourceTournamentId: string; fromRank: number; topN: number }[];
};

/** Etapa de una temporada: en vez de una fecha, "día N + hora" relativo al día 0 de cada instancia. */
export type StageFormProps = { seasonId: string; stageId: string | null; offsetDays: number; startTime: string };

const STAGE_DAY0 = "2030-01-07"; // día 0 de referencia para la vista previa de una etapa

const SELECT = "border-input bg-background h-9 rounded-md border px-3 text-sm";

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
  formatLocked,
  sources = [],
  now,
  stage,
}: {
  id: string | null;
  initial: TournamentFormValues;
  categories: { id: string; name: string; icon: string | null }[];
  /** Ya empezó: los tiempos quedan bloqueados. */
  started?: boolean;
  /** Ya se publicó: el formato no se cambia. */
  formatLocked?: boolean;
  /** Torneos que pueden dar clasificados a una eliminatoria. */
  sources?: { id: string; name: string }[];
  /** Instante de render (ISO), para la vista previa. */
  now: string;
  /** Modo plantilla: etapa de una temporada. */
  stage?: StageFormProps;
}) {
  const [state, action] = useActionState(stage ? saveStageAction.bind(null, stage.seasonId, stage.stageId) : saveTournamentAction.bind(null, id), null);
  const fe = state?.fieldErrors;
  const v = state?.values;
  const num = (k: keyof TournamentFormValues) => String(v?.[k] ?? initial[k] ?? "");
  const [startsAt, setStartsAt] = useState(v?.startsAt ?? initial.startsAt);
  const [offsetDays, setOffsetDays] = useState(String(v?.offsetDays ?? stage?.offsetDays ?? 0));
  const [startTime, setStartTime] = useState(String(v?.startTime ?? stage?.startTime ?? "20:00"));
  const [quizCount, setQuizCount] = useState(num("quizCount"));
  const [freq, setFreq] = useState(num("frequencyHours"));
  const [active, setActive] = useState(num("quizActiveHours"));
  const [lead, setLead] = useState(num("registrationLeadDays"));
  const [late, setLate] = useState(num("lateEntryDays"));
  const [format, setFormat] = useState<string>(v?.format ?? initial.format);
  const [maxP, setMaxP] = useState(num("maxParticipants") || "32");
  const [qualifiers, setQualifiers] = useState(initial.qualifiers);
  const [perMatch, setPerMatch] = useState(num("questionsPerQuiz"));
  const [unique, setUnique] = useState(num("uniqueQuestions"));
  const need = bracketQuestionNeed(Number(maxP) || 4, Number(perMatch) || 0, unique ? Number(unique) : null, false);
  const ko = format === "KNOCKOUT";

  const preview = useMemo(() => {
    const t = {
      startsAt: stage ? stageStart(STAGE_DAY0, { offsetDays: Number(offsetDays) || 0, startTime }) : fromDateTimeInput(startsAt, DEFAULT_TZ),
      quizCount: ko ? roundsFor(Number(maxP) || 2) : Number(quizCount),
      frequencyHours: Number(freq),
      quizActiveHours: ko ? Number(freq) : Number(active),
      registrationLeadDays: Number(lead),
      lateEntryDays: ko ? 0 : Number(late),
    };
    const ok =
      !Number.isNaN(t.startsAt.getTime()) &&
      [t.quizCount, t.frequencyHours, t.quizActiveHours].every((n) => Number.isInteger(n) && n > 0) &&
      [t.registrationLeadDays, t.lateEntryDays].every((n) => Number.isInteger(n) && n >= 0) &&
      t.quizCount <= 100;
    return ok ? tournamentTimeline(t, new Date(now)) : null;
  }, [startsAt, quizCount, freq, active, lead, late, now, ko, maxP, stage, offsetDays, startTime]);
  // En una etapa las fechas son relativas: "día 3, 20:00".
  const d = (x: Date) =>
    stage ? `día ${daysBetween(STAGE_DAY0, localDay(x))}, ${formatDate(x, DEFAULT_TZ, "HH:mm")}` : formatDate(x, DEFAULT_TZ, "EEE d/M HH:mm");
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
          <Field
            label="Nombre"
            name="name"
            required
            defaultValue={v?.name ?? initial.name}
            errors={fe?.name}
            hint={stage ? "Cada instancia lo llama «{nombre} · {temporada} #n»." : undefined}
          />
          {!stage && (
            <Field label="Identificador (slug)" name="slug" defaultValue={v?.slug ?? initial.slug} errors={fe?.slug} hint="Vacío = se genera del nombre." />
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="format">Formato</Label>
            {formatLocked && <input type="hidden" name="format" value={format} />}
            <select id="format" name="format" className={SELECT} value={format} disabled={formatLocked} onChange={(e) => setFormat(e.target.value)}>
              <option value="POINTS">Por puntos: todos juegan los mismos cuestionarios y suman</option>
              <option value="KNOCKOUT">Eliminatoria: partidos 1 contra 1, el que gana pasa de ronda</option>
            </select>
            {formatLocked && <p className="text-muted-foreground text-xs">El formato no se cambia después de publicar.</p>}
          </div>
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
            {stage
              ? "Día de inicio contado desde el día 0 de cada instancia (el día 0 lo elegís al lanzarla) y hora de Buenos Aires."
              : "Cargás cuándo empieza y el resto se calcula (hora de Buenos Aires)."}
            {started && " El torneo ya empezó: los tiempos no se pueden cambiar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {stage ? (
              <div className="grid content-start gap-1.5">
                <Label htmlFor="offsetDays">Empieza el día (desde el día 0) y a las</Label>
                <div className="flex gap-2">
                  <Input id="offsetDays" name="offsetDays" type="number" min={0} max={730} required value={offsetDays} onChange={(e) => setOffsetDays(e.target.value)} className="w-24" />
                  <Input id="startTime" name="startTime" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-32" />
                </div>
                <FieldErrors errors={fe?.offsetDays} />
                <FieldErrors errors={fe?.startTime} />
              </div>
            ) : (
              <div className="grid content-start gap-1.5">
                <Label htmlFor="startsAt">Empieza (primer cuestionario)</Label>
                <Input readOnly={started} id="startsAt" name="startsAt" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                <FieldErrors errors={fe?.startsAt} />
              </div>
            )}
            <div className={ko ? "hidden" : "grid content-start gap-1.5"}>
              <Label htmlFor="quizCount">Cuestionarios</Label>
              <Input readOnly={started} id="quizCount" name="quizCount" type="number" min={1} max={100} required value={quizCount} onChange={(e) => setQuizCount(e.target.value)} />
              <FieldErrors errors={fe?.quizCount} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="frequencyHours">{ko ? "Cada ronda dura (horas)" : "Uno cada (horas)"}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly={started} id="frequencyHours" name="frequencyHours" type="number" min={1} required value={freq} onChange={(e) => setFreq(e.target.value)} className="w-24" />
                {!started && PRESET_HOURS.map((h) => (
                  <Button key={h} type="button" size="sm" variant={Number(freq) === h ? "secondary" : "outline"} onClick={() => setFreq(String(h))}>
                    {h} h
                  </Button>
                ))}
              </div>
              {ko && <p className="text-muted-foreground text-xs">Un partido por ronda: cada jugador tiene ese tiempo para jugarlo. 24 o 48 h dan margen.</p>}
              <FieldErrors errors={fe?.frequencyHours} />
            </div>
            <div className={ko ? "hidden" : "grid content-start gap-1.5"}>
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
            <div className={ko ? "hidden" : "grid content-start gap-1.5"}>
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
                <strong>{preview.slots.length} {ko ? "rondas (con el cuadro lleno)" : "cuestionarios"}:</strong> {d(preview.slots[0])}
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
          <div className={ko ? "hidden" : "flex items-start gap-2 sm:col-span-2"}>
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
            label={ko ? "Preguntas por partido" : "Preguntas por cuestionario"}
            name="questionsPerQuiz"
            type="number"
            min={1}
            max={100}
            value={perMatch}
            onChange={(e) => setPerMatch(e.target.value)}
            errors={fe?.questionsPerQuiz}
          />
          {ko ? (
            <>
              <Field
                label="Preguntas propias de cada partido (opcional)"
                name="uniqueQuestions"
                type="number"
                min={1}
                max={100}
                value={unique}
                onChange={(e) => setUnique(e.target.value)}
                errors={fe?.uniqueQuestions}
                hint="Ej. 5 de 10: cada partido lleva 5 preguntas solo suyas y las otras 5 se sortean (en otro orden) de un pozo común de 10 de la ronda. Así difieren entre partidos (pasarle las respuestas a un amigo sirve poco) y se gasta menos banco. Vacío = todas distintas."
              />
              <div className="grid content-start gap-1.5">
                <Label htmlFor="questionSource">De dónde salen las preguntas</Label>
                <select id="questionSource" name="questionSource" className={SELECT} defaultValue={v?.questionSource ?? initial.questionSource}>
                  <option value="NEW_FIRST">Nuevas primero (si faltan, reutilizadas si la config lo permite)</option>
                  <option value="REUSED_FIRST">Reutilizadas primero, para cuidar el banco (si faltan, nuevas)</option>
                </select>
                <p className="text-muted-foreground text-xs">
                  Reutilizadas = usadas hace más de los días de la config (Calendario automático). Nunca se repiten preguntas dentro del torneo.
                </p>
              </div>
              <p className="text-muted-foreground text-sm sm:col-span-2">
                Cada partido tiene su cuestionario (el mismo para los dos, mezclado), que se arma solo cuando se conocen los dos jugadores. Un cuadro
                de {maxP} lleno necesita hasta <strong>{need}</strong> preguntas.
              </p>
            </>
          ) : stage ? null : (
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
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Inscripción, comodines y premios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Costo (créditos)" name="entryCost" type="number" min={0} defaultValue={v?.entryCost ?? initial.entryCost} hint="No se puede cambiar cuando ya hay inscriptos." />
          {ko ? (
            <div className="grid gap-1.5">
              <Label htmlFor="maxParticipants">Tamaño máximo del cuadro</Label>
              <select id="maxParticipants" name="maxParticipants" className={SELECT} value={maxP} onChange={(e) => setMaxP(e.target.value)}>
                {BRACKET_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} jugadores
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Si se anotan menos, el cuadro se achica (31 → 32) y los lugares que faltan son pases libres para los mejores sembrados.
              </p>
              <FieldErrors errors={fe?.maxParticipants} />
            </div>
          ) : (
            <Field label="Cupo máximo (opcional)" name="maxParticipants" type="number" min={2} defaultValue={v?.maxParticipants ?? initial.maxParticipants ?? ""} />
          )}
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
            hint={
              ko
                ? "Separados por coma por puesto: 1° campeón, 2° finalista, 3° semifinalistas (3° y 4° con partido por el tercer puesto), 5° los de cuartos, 9° los de octavos… Ej. «150, 75, 30, 0, 10» da 10 a los de cuartos."
                : "Separados por coma: 1° puesto, 2°, 3°…"
            }
            errors={fe?.prizes}
            className="sm:col-span-2"
          />
          <Field
            label="Premios en estrellas ⭐ por puesto (opcional)"
            name="prizeStars"
            defaultValue={v?.prizeStars ?? initial.prizeStars}
            placeholder="5, 2, 1"
            hint="Mismo orden que los créditos. Las estrellas se canjean por vidas extra. Dejalo vacío si no da estrellas."
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>
      {ko && (
        <Card>
          <CardHeader>
            <CardTitle>Eliminatoria</CardTitle>
            <CardDescription>
              Gana el partido quien hace más puntos; si empatan, más aciertos, después menos tiempo y por último el mejor sembrado. Quien no juega
              antes del cierre pierde por W.O. (si no juega ninguno, pasa el mejor sembrado). El resultado se ve cuando jugaron los dos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="seeding">Siembra</Label>
              <select id="seeding" name="seeding" className={SELECT} defaultValue={v?.seeding ?? initial.seeding}>
                <option value="QUALIFICATION">Por clasificación: primero los clasificados por puesto, después el resto por su historial en torneos</option>
                <option value="RANDOM">Sorteo</option>
              </select>
            </div>
            <div className="flex items-start gap-2">
              <Switch id="thirdPlaceMatch" name="thirdPlaceMatch" defaultChecked={v ? v.thirdPlaceMatch === "on" : initial.thirdPlaceMatch} />
              <Label htmlFor="thirdPlaceMatch">Partido por el tercer puesto (entre los que pierden las semifinales)</Label>
            </div>
            {stage ? (
              <p className="text-muted-foreground text-sm">
                Los clasificados a esta eliminatoria se cargan en las <strong>reglas de clasificación</strong> de la temporada.
              </p>
            ) : (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Clasificatorios</legend>
              <p className="text-muted-foreground text-xs">
                Los puestos elegidos de cada torneo (ej. del 1 al 8, o del 9 al 16) entran gratis cuando ese torneo termina. Sus lugares quedan
                reservados mientras tanto; el resto del cupo es inscripción abierta con costo.
              </p>
              {qualifiers.map((q, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    name="q.source"
                    className={`${SELECT} min-w-0 flex-1`}
                    value={q.sourceTournamentId}
                    onChange={(e) => setQualifiers(qualifiers.map((x, j) => (j === i ? { ...x, sourceTournamentId: e.target.value } : x)))}
                  >
                    <option value="">Elegí un torneo…</option>
                    {sources.map((src) => (
                      <option key={src.id} value={src.id}>
                        {src.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm">del puesto</span>
                  <Input
                    name="q.fromRank"
                    type="number"
                    min={1}
                    className="w-20"
                    value={q.fromRank}
                    onChange={(e) => setQualifiers(qualifiers.map((x, j) => (j === i ? { ...x, fromRank: Number(e.target.value) } : x)))}
                  />
                  <span className="text-sm">al</span>
                  <Input
                    name="q.topN"
                    type="number"
                    min={1}
                    className="w-20"
                    value={q.topN}
                    onChange={(e) => setQualifiers(qualifiers.map((x, j) => (j === i ? { ...x, topN: Number(e.target.value) } : x)))}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setQualifiers(qualifiers.filter((_, j) => j !== i))}>
                    Quitar
                  </Button>
                </div>
              ))}
              {qualifiers.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => setQualifiers([...qualifiers, { sourceTournamentId: "", fromRank: 1, topN: 4 }])}
                >
                  + Agregar clasificatorio
                </Button>
              )}
              <FieldErrors errors={fe?.qualifiers} />
            </fieldset>
            )}
            <div className="flex items-start gap-2">
              <Switch
                id="autoConfirmQualified"
                name="autoConfirmQualified"
                defaultChecked={v ? v.autoConfirmQualified === "on" : initial.autoConfirmQualified}
              />
              <div className="grid gap-0.5">
                <Label htmlFor="autoConfirmQualified">Inscribir a los clasificados sin que tengan que confirmar</Label>
                <p className="text-muted-foreground text-xs">
                  Apagado: confirman su lugar antes de que cierre la inscripción; si no, lo pierden (y puede haber más pases libres).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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
        <SubmitButton pendingText="Guardando…">{stage ? (stage.stageId ? "Guardar torneo" : "Agregar a la temporada") : id ? "Guardar cambios" : "Crear torneo"}</SubmitButton>
      </div>
    </form>
  );
}
