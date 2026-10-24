"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Rocket, Save, Swords, Trash2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useActionToast } from "@/components/use-action-toast";
import { DEFAULT_TZ, formatDate } from "@/lib/format";
import { ruleSlots, seasonQuestionNeed, seasonTimeline, validateSeason, type RulePlan, type StagePlan } from "@/server/seasons/plan";
import { deleteStageAction, launchSeasonAction, moveStageAction, saveRulesAction } from "../actions";

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";
const DAY = 86_400_000;

type Rule = RulePlan & { key: number };

const plain = (rs: Rule[]): RulePlan[] => rs.map((r) => ({ sourceStageId: r.sourceStageId, targetStageId: r.targetStageId, fromRank: r.fromRank, toRank: r.toRank }));

export function SeasonPlanner({
  seasonId,
  stages,
  rules: initialRules,
  defaultDay0,
  now,
  archived,
}: {
  seasonId: string;
  stages: StagePlan[];
  rules: RulePlan[];
  defaultDay0: string;
  now: string;
  archived: boolean;
}) {
  const { pending, run } = useActionToast();
  const [rules, setRules] = useState<Rule[]>(initialRules.map((r, key) => ({ ...r, key })));
  const [day0, setDay0] = useState(defaultDay0);
  const dirty = JSON.stringify(plain(rules)) !== JSON.stringify(initialRules);
  const knockouts = stages.filter((s) => s.format === "KNOCKOUT");
  const issues = useMemo(() => validateSeason(stages, rules), [stages, rules]);
  const tl = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(day0) && stages.length ? seasonTimeline(stages, day0, new Date(now)) : null), [stages, day0, now]);
  const name = (id: string) => stages.find((s) => s.id === id)?.name ?? "?";
  const d = (x: Date) => formatDate(x, DEFAULT_TZ, "EEE d/M HH:mm");
  const setRule = (key: number, patch: Partial<RulePlan>) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Línea de tiempo: desde que abre la primera inscripción hasta la última final.
  const span = tl ? { from: tl.registrationOpensAt.getTime(), to: tl.endsAt.getTime() } : null;
  const pct = (t: number) => (span ? ((t - span.from) / Math.max(1, span.to - span.from)) * 100 : 0);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Torneos de la temporada</CardTitle>
          <CardDescription>
            Fechas relativas al día 0 de cada instancia. Entre eliminatorias, la de más arriba es la de <strong>mejor nivel</strong>: quien clasifica
            a dos va solo a la mejor y su lugar en la otra pasa al siguiente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {stages.length === 0 && <p className="text-muted-foreground text-sm">Todavía no tiene torneos.</p>}
          <ol className="grid gap-2">
            {stages.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                {s.format === "KNOCKOUT" ? <Swords className="text-amber-500 size-4" aria-hidden /> : <Trophy className="text-primary size-4" aria-hidden />}
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground text-xs">
                    Día {s.offsetDays}, {s.startTime} ·{" "}
                    {s.format === "KNOCKOUT"
                      ? `eliminatoria de hasta ${s.maxParticipants}, rondas de ${s.frequencyHours} h`
                      : `${s.quizCount} cuestionarios, uno cada ${s.frequencyHours} h`}
                  </span>
                </div>
                <Button size="icon" variant="ghost" disabled={i === 0 || pending} onClick={() => run(() => moveStageAction(seasonId, s.id, -1), "Listo.")} aria-label="Subir">
                  <ArrowUp />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={i === stages.length - 1 || pending}
                  onClick={() => run(() => moveStageAction(seasonId, s.id, 1), "Listo.")}
                  aria-label="Bajar"
                >
                  <ArrowDown />
                </Button>
                <Button size="icon" variant="ghost" asChild aria-label="Editar">
                  <Link href={`/admin/temporadas/${seasonId}/torneos/${s.id}`}>
                    <Pencil />
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="Quitar" disabled={pending}>
                      <Trash2 />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Quitar «{s.name}» de la plantilla?</AlertDialogTitle>
                      <AlertDialogDescription>También se borran sus reglas de clasificación. Los torneos ya lanzados no cambian.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => run(() => deleteStageAction(seasonId, s.id), "Quitado.")}>Quitar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" size="sm" className="justify-self-start">
            <Link href={`/admin/temporadas/${seasonId}/torneos/nuevo`}>
              <Plus /> Agregar torneo
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reglas de clasificación</CardTitle>
          <CardDescription>
            Qué puestos de cada torneo entran gratis a cada eliminatoria (ej. del 1 al 8 a Oro y del 9 al 16 a Plata). Se aplican al terminar el
            torneo de origen; si alguien no puede (baneado, ya está, o subió a una mejor), el lugar pasa al siguiente de la tabla.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {knockouts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Agregá al menos una eliminatoria para cargar reglas.</p>
          ) : (
            <>
              {rules.map((r) => (
                <div key={r.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Del puesto</span>
                  <Input type="number" min={1} className="w-20" value={r.fromRank} onChange={(e) => setRule(r.key, { fromRank: Number(e.target.value) })} aria-label="Desde el puesto" />
                  <span>al</span>
                  <Input type="number" min={1} className="w-20" value={r.toRank} onChange={(e) => setRule(r.key, { toRank: Number(e.target.value) })} aria-label="Hasta el puesto" />
                  <span>de</span>
                  <select className={`${SELECT} min-w-0 flex-1`} value={r.sourceStageId} onChange={(e) => setRule(r.key, { sourceStageId: e.target.value })} aria-label="Torneo de origen">
                    <option value="">Elegí…</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span>→</span>
                  <select className={`${SELECT} min-w-0 flex-1`} value={r.targetStageId} onChange={(e) => setRule(r.key, { targetStageId: e.target.value })} aria-label="Eliminatoria">
                    <option value="">Elegí…</option>
                    {knockouts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground text-xs">({Math.max(0, ruleSlots(r))} lugares)</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRules((rs) => rs.filter((x) => x.key !== r.key))}>
                    Quitar
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRules((rs) => [
                      ...rs,
                      { key: Math.max(0, ...rs.map((x) => x.key)) + 1, sourceStageId: "", targetStageId: knockouts[0].id, fromRank: 1, toRank: 8 },
                    ])
                  }
                >
                  <Plus /> Agregar regla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty || pending}
                  onClick={() =>
                    run(
                      () => saveRulesAction(seasonId, plain(rules)),
                      "Reglas guardadas.",
                    )
                  }
                >
                  <Save /> Guardar reglas
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendario y lanzamiento</CardTitle>
          <CardDescription>Elegí el día 0 para ver las fechas exactas. Lanzar crea y publica todos los torneos de una instancia nueva.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="day0">Día 0</Label>
              <Input id="day0" type="date" value={day0} onChange={(e) => setDay0(e.target.value)} className="w-44" />
            </div>
            {tl && (
              <p className="text-muted-foreground text-sm">
                {d(tl.startsAt)} → {d(tl.endsAt)} · {Math.ceil((tl.endsAt.getTime() - tl.startsAt.getTime()) / DAY)} días · hasta{" "}
                {seasonQuestionNeed(stages)} preguntas
              </p>
            )}
          </div>

          {tl && span && (
            <div className="grid gap-2" role="img" aria-label="Línea de tiempo de la temporada">
              {stages.map((s) => {
                const x = tl.dates.get(s.id)!;
                const reg = { left: pct(x.registrationOpensAt.getTime()), right: pct(x.registrationEndsAt.getTime()) };
                const play = { left: pct(x.startsAt.getTime()), right: pct(x.endsAt.getTime()) };
                const fedBy = rules.filter((r) => r.targetStageId === s.id && r.sourceStageId);
                return (
                  <div key={s.id} className="grid gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">
                        {d(x.startsAt)} → {d(x.endsAt)}
                        {fedBy.length > 0 && ` · ← ${fedBy.map((r) => `${r.fromRank}–${r.toRank} de ${name(r.sourceStageId)}`).join(", ")}`}
                      </span>
                    </div>
                    <div className="bg-muted relative h-3 overflow-hidden rounded-full">
                      <div
                        className="bg-muted-foreground/30 absolute inset-y-0"
                        style={{ left: `${reg.left}%`, width: `${Math.max(0.5, reg.right - reg.left)}%` }}
                        title={`Inscripción: ${d(x.registrationOpensAt)} → ${d(x.registrationEndsAt)}`}
                      />
                      <div
                        className={`absolute inset-y-0 rounded-full ${s.format === "KNOCKOUT" ? "bg-amber-500" : "bg-primary"}`}
                        style={{ left: `${play.left}%`, width: `${Math.max(0.8, play.right - play.left)}%` }}
                        title={`Juego: ${d(x.startsAt)} → ${d(x.endsAt)}`}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="bg-muted-foreground/30 inline-block h-2 w-4 rounded" /> inscripción
                </span>
                <span className="flex items-center gap-1">
                  <span className="bg-primary inline-block h-2 w-4 rounded" /> por puntos
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-4 rounded bg-amber-500" /> eliminatoria
                </span>
              </p>
            </div>
          )}

          {issues.length > 0 && (
            <ul className="bg-destructive/10 text-destructive grid gap-1 rounded-md p-3 text-sm">
              {issues.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          )}
          {dirty && <p className="text-sm text-amber-600">Guardá las reglas antes de lanzar.</p>}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="justify-self-start" disabled={pending || archived || issues.length > 0 || dirty || !tl}>
                <Rocket /> Lanzar instancia
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Lanzar con día 0 el {tl ? formatDate(tl.startsAt, DEFAULT_TZ, "EEEE d 'de' MMMM") : day0}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se crean y publican {stages.length} torneos con sus fechas y clasificatorios. Los jugadores los ven enseguida y cada inscripción abre
                  según su anticipación.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(() => launchSeasonAction(seasonId, day0), "Temporada lanzada.")}>Lanzar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {knockouts.length > 0 && (
            <p className="text-muted-foreground text-xs">
              <Badge variant="secondary">Tip</Badge> Si un cuadro tiene más lugares que los que dan las reglas, el resto queda para inscripción abierta
              (con el costo de la eliminatoria).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
