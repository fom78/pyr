const DAY = 86_400_000;

export type CoverageLevel = "OK" | "WARNING" | "CRITICAL";

export type CoverageSlot = {
  at: Date;
  /** Preguntas ya puestas en el borrador de ese turno (ya no figuran como nunca usadas). */
  reserved: number;
};

export type Coverage = {
  slots: number;
  /** Último turno que se cubre solo con nunca usadas (o reservadas). null = ni el primero. */
  freshCoveredUntil: Date | null;
  /** Último turno que se cubre sumando reutilizables. */
  totalCoveredUntil: Date | null;
  /** Primer turno al que no le alcanzan las nunca usadas. */
  firstShortSlot: Date | null;
  /** Nunca usadas que faltan para cubrir los turnos de la ventana de aviso. */
  freshShortfall: number;
  /** Lo que falta aun reutilizando, en la ventana de aviso. */
  totalShortfall: number;
  /** Turnos de la ventana de aviso a los que no les alcanzan las nunca usadas. */
  slotsShort: number;
  level: CoverageLevel;
};

/**
 * Proyecta si el banco alcanza para los turnos futuros. Los turnos se recorren en orden gastando
 * primero lo reservado en su borrador, después las nunca usadas y por último las reutilizables.
 * Nivel: CRITICAL si las nunca usadas no cubren la ventana crítica, WARNING si no cubren la de aviso.
 */
export function projectCoverage(input: {
  slots: CoverageSlot[];
  perQuiz: number;
  fresh: number;
  reusable: number;
  now: Date;
  warnDays: number;
  criticalDays: number;
}): Coverage {
  const slots = [...input.slots].sort((a, b) => a.at.getTime() - b.at.getTime());
  const warnUntil = input.now.getTime() + input.warnDays * DAY;
  const criticalUntil = input.now.getTime() + input.criticalDays * DAY;
  let fresh = input.fresh;
  let reusable = input.reusable;
  let freshOk = true;
  let totalOk = true;
  const out: Coverage = {
    slots: slots.length,
    freshCoveredUntil: null,
    totalCoveredUntil: null,
    firstShortSlot: null,
    freshShortfall: 0,
    totalShortfall: 0,
    slotsShort: 0,
    level: "OK",
  };
  for (const slot of slots) {
    const need = Math.max(0, input.perQuiz - slot.reserved);
    const fromFresh = Math.min(need, fresh);
    fresh -= fromFresh;
    const freshMissing = need - fromFresh;
    const fromReuse = Math.min(freshMissing, reusable);
    reusable -= fromReuse;
    const totalMissing = freshMissing - fromReuse;

    if (freshMissing > 0) {
      freshOk = false;
      out.firstShortSlot ??= slot.at;
    }
    if (totalMissing > 0) totalOk = false;
    if (freshOk) out.freshCoveredUntil = slot.at;
    if (totalOk) out.totalCoveredUntil = slot.at;
    if (slot.at.getTime() <= warnUntil) {
      out.freshShortfall += freshMissing;
      out.totalShortfall += totalMissing;
      if (freshMissing > 0) out.slotsShort++;
    }
  }
  const short = out.firstShortSlot?.getTime();
  if (short !== undefined && short <= criticalUntil) out.level = "CRITICAL";
  else if (short !== undefined && short <= warnUntil) out.level = "WARNING";
  return out;
}
