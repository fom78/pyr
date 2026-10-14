import { DEFAULT_TZ } from "@/lib/format";
import { addLocalDays, gridSlots } from "@/server/autoquiz/slots";

const HOUR = 3_600_000;

/** Parámetros relativos de un torneo: se carga el inicio y todo lo demás se deriva. */
export type TimelineInput = {
  startsAt: Date;
  quizCount: number;
  frequencyHours: number;
  quizActiveHours: number;
  /** La inscripción abre N días antes del inicio (0 = ya, al publicar). */
  registrationLeadDays: number;
  /** La inscripción sigue abierta N días después de empezar (0 = cierra al empezar). */
  lateEntryDays: number;
};

/**
 * Turnos y fechas de un torneo (pura). Turno i = startsAt + i × frequencyHours (múltiplos de 24:
 * misma hora local aunque cambie el horario, como el calendario de la liga). Termina cuando cierra
 * el último cuestionario.
 */
export function tournamentTimeline(t: TimelineInput, now: Date, tz = DEFAULT_TZ) {
  const span = t.quizCount * t.frequencyHours * HOUR + 3 * 24 * HOUR;
  const slots = gridSlots(
    { anchorAt: t.startsAt, frequencyHours: t.frequencyHours, excludedWeekdays: [], timezone: tz },
    new Date(t.startsAt.getTime() - 1),
    new Date(t.startsAt.getTime() + span),
  )
    .slice(0, t.quizCount)
    .map((s) => s.at);
  const last = slots.at(-1) ?? t.startsAt;
  const endsAt = new Date(last.getTime() + t.quizActiveHours * HOUR);
  const registrationOpensAt =
    t.registrationLeadDays > 0 ? addLocalDays(t.startsAt, -t.registrationLeadDays, tz) : new Date(Math.min(now.getTime(), t.startsAt.getTime()));
  const late = t.lateEntryDays > 0 ? addLocalDays(t.startsAt, t.lateEntryDays, tz) : t.startsAt;
  // Nunca después del último turno: no tiene sentido inscribirse cuando ya no queda nada para jugar.
  const registrationEndsAt = new Date(Math.min(late.getTime(), last.getTime()));
  return { slots, endsAt, registrationOpensAt, registrationEndsAt };
}

/** Problemas de una configuración (para el formulario). */
export function timelineIssues(t: TimelineInput): { field: keyof TimelineInput; message: string }[] {
  const out: { field: keyof TimelineInput; message: string }[] = [];
  if (t.quizActiveHours > t.frequencyHours * t.quizCount)
    out.push({ field: "quizActiveHours", message: "Cada cuestionario no puede durar más que todo el torneo." });
  if (t.lateEntryDays * 24 > (t.quizCount - 1) * t.frequencyHours && t.lateEntryDays > 0)
    out.push({ field: "lateEntryDays", message: "La inscripción tardía no puede pasar del último cuestionario." });
  return out;
}
