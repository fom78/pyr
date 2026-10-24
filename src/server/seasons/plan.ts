/** Temporadas: fechas y validación de la plantilla (funciones puras). */
import { DEFAULT_TZ, fromDateTimeInput, toDateTimeInput } from "@/lib/format";
import { tournamentTimeline } from "@/server/tournaments/timeline";
import { bracketQuestionNeed, isBracketSize, roundsFor } from "@/server/tournaments/bracket";

const DAY = 86_400_000;

/** Lo que el plan necesita de una etapa (su `config` ya validado). */
export type StagePlan = {
  id: string;
  name: string;
  position: number;
  offsetDays: number;
  startTime: string; // "HH:mm"
  format: "POINTS" | "KNOCKOUT";
  quizCount: number;
  frequencyHours: number;
  quizActiveHours: number;
  registrationLeadDays: number;
  lateEntryDays: number;
  questionsPerQuiz: number;
  maxParticipants: number | null;
  uniqueQuestions: number | null;
  thirdPlaceMatch: boolean;
};

export type RulePlan = { sourceStageId: string; targetStageId: string; fromRank: number; toRank: number };

export type StageDates = { startsAt: Date; endsAt: Date; registrationOpensAt: Date; registrationEndsAt: Date };

/** "YYYY-MM-DD" + n días (calendario, sin zona). */
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

/** Día local ("YYYY-MM-DD") de un instante. */
export function localDay(at: Date, tz = DEFAULT_TZ) {
  return toDateTimeInput(at, tz).slice(0, 10);
}

/** Días de calendario entre dos "YYYY-MM-DD". */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

/** Inicio de una etapa: día 0 + offset, a su hora local. */
export function stageStart(day0: string, s: Pick<StagePlan, "offsetDays" | "startTime">, tz = DEFAULT_TZ) {
  return fromDateTimeInput(`${addDays(day0, s.offsetDays)}T${s.startTime}`, tz);
}

/** Tiempos efectivos (en una eliminatoria: una "fecha" por ronda, sin inscripción tardía). */
function timing(s: StagePlan) {
  if (s.format === "KNOCKOUT") {
    const rounds = roundsFor(s.maxParticipants && isBracketSize(s.maxParticipants) ? s.maxParticipants : 4);
    return { ...s, quizCount: rounds, quizActiveHours: s.frequencyHours, lateEntryDays: 0 };
  }
  return s;
}

/**
 * Fechas absolutas de cada etapa para un día 0, y el inicio y fin de la instancia. `now` solo importa
 * para etapas con inscripción "al publicar" (anticipación 0).
 */
export function seasonTimeline(stages: StagePlan[], day0: string, now = new Date(), tz = DEFAULT_TZ) {
  const dates = new Map<string, StageDates>();
  for (const s of stages) {
    const startsAt = stageStart(day0, s, tz);
    const t = tournamentTimeline({ ...timing(s), startsAt }, now, tz);
    dates.set(s.id, { startsAt, endsAt: t.endsAt, registrationOpensAt: t.registrationOpensAt, registrationEndsAt: t.registrationEndsAt });
  }
  const all = [...dates.values()];
  const startsAt = all.length ? new Date(Math.min(...all.map((d) => d.startsAt.getTime()))) : stageStart(day0, { offsetDays: 0, startTime: "00:00" }, tz);
  const endsAt = all.length ? new Date(Math.max(...all.map((d) => d.endsAt.getTime()))) : startsAt;
  const registrationOpensAt = all.length ? new Date(Math.min(...all.map((d) => d.registrationOpensAt.getTime()))) : startsAt;
  return { dates, startsAt, endsAt, registrationOpensAt };
}

/** Cupos de una regla. */
export function ruleSlots(r: Pick<RulePlan, "fromRank" | "toRank">) {
  return r.toRank - r.fromRank + 1;
}

/** Problemas de la plantilla (en español, para mostrar). Vacío = se puede lanzar. */
export function validateSeason(stages: StagePlan[], rules: RulePlan[]): string[] {
  const out: string[] = [];
  if (!stages.length) return ["Agregá al menos un torneo."];
  const byId = new Map(stages.map((s) => [s.id, s]));
  // Fechas relativas: cualquier día 0 sirve para comparar (sin anticipación 0 dependiente de "ahora").
  const { dates } = seasonTimeline(stages, "2030-01-07", new Date("2000-01-01T00:00:00Z"));
  const name = (id: string) => `"${byId.get(id)?.name ?? "?"}"`;

  for (const r of rules) {
    const src = byId.get(r.sourceStageId);
    const dst = byId.get(r.targetStageId);
    if (!src || !dst) {
      out.push("Una regla apunta a un torneo que ya no existe.");
      continue;
    }
    if (dst.format !== "KNOCKOUT") out.push(`${name(dst.id)} no es una eliminatoria: no recibe clasificados.`);
    if (src.id === dst.id) out.push(`${name(src.id)} no puede clasificar a sí mismo.`);
    if (r.fromRank < 1 || r.toRank < r.fromRank) out.push(`Rango inválido de ${name(src.id)} a ${name(dst.id)}: del ${r.fromRank} al ${r.toRank}.`);
    const a = dates.get(src.id)!;
    const b = dates.get(dst.id)!;
    if (src.id !== dst.id && a.endsAt > b.registrationEndsAt)
      out.push(`${name(src.id)} termina después de que cierra la inscripción de ${name(dst.id)}: sus clasificados no llegarían.`);
  }

  // Rangos del mismo origen que se pisan (entre eliminatorias o dentro de una).
  const bySource = new Map<string, RulePlan[]>();
  for (const r of rules) bySource.set(r.sourceStageId, [...(bySource.get(r.sourceStageId) ?? []), r]);
  for (const [src, list] of bySource) {
    const sorted = [...list].sort((x, y) => x.fromRank - y.fromRank);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].fromRank <= sorted[i - 1].toRank)
        out.push(`Los puestos de ${name(src)} se pisan: ${sorted[i - 1].fromRank}–${sorted[i - 1].toRank} y ${sorted[i].fromRank}–${sorted[i].toRank}.`);
  }

  // Cupos por eliminatoria.
  for (const s of stages.filter((x) => x.format === "KNOCKOUT")) {
    const reserved = rules.filter((r) => r.targetStageId === s.id).reduce((a, r) => a + Math.max(0, ruleSlots(r)), 0);
    if (s.maxParticipants && reserved > s.maxParticipants)
      out.push(`${name(s.id)}: las reglas reservan ${reserved} lugares y el cuadro es de ${s.maxParticipants}.`);
  }

  // Ciclos (una eliminatoria que termina alimentando a una que la alimenta).
  const next = new Map<string, string[]>();
  for (const r of rules) next.set(r.sourceStageId, [...(next.get(r.sourceStageId) ?? []), r.targetStageId]);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    const cyc = (next.get(id) ?? []).some(visit);
    state.set(id, 2);
    return cyc;
  };
  if (stages.some((s) => visit(s.id))) out.push("Las reglas forman un ciclo.");
  return [...new Set(out)];
}

/** Orden de creación: cada etapa después de las que la alimentan (los orígenes tienen que existir). */
export function creationOrder(stages: StagePlan[], rules: RulePlan[]): StagePlan[] {
  const out: StagePlan[] = [];
  const done = new Set<string>();
  const sorted = [...stages].sort((a, b) => a.offsetDays - b.offsetDays || a.position - b.position);
  const add = (s: StagePlan, seen: Set<string>) => {
    if (done.has(s.id) || seen.has(s.id)) return;
    seen.add(s.id);
    for (const r of rules.filter((x) => x.targetStageId === s.id)) {
      const src = stages.find((x) => x.id === r.sourceStageId);
      if (src) add(src, seen);
    }
    done.add(s.id);
    out.push(s);
  };
  for (const s of sorted) add(s, new Set());
  return out;
}

/** Preguntas que puede necesitar una instancia completa (estimación para el banco). */
export function seasonQuestionNeed(stages: StagePlan[]) {
  return stages.reduce(
    (a, s) =>
      a +
      (s.format === "KNOCKOUT"
        ? bracketQuestionNeed(s.maxParticipants ?? 4, s.questionsPerQuiz, s.uniqueQuestions, s.thirdPlaceMatch)
        : s.quizCount * s.questionsPerQuiz),
    0,
  );
}
