/** Reglas puras de inscripción de un torneo (se usan en servicios, páginas y en el agrupado de `/torneos`). */

/** Estado de la inscripción según las fechas. */
export function registrationState(t: { status: string; registrationOpensAt: Date; registrationEndsAt: Date }, now = new Date()) {
  if (t.status !== "PUBLISHED") return "CLOSED" as const;
  if (now < t.registrationOpensAt) return "NOT_YET" as const;
  if (now >= t.registrationEndsAt) return "CLOSED" as const;
  return "OPEN" as const;
}

/** Lugares que da un clasificatorio: del puesto `fromRank` al `topN`. */
export function qualifierSlots(q: { fromRank: number; topN: number }) {
  return Math.max(0, q.topN - q.fromRank + 1);
}

/**
 * Eliminatoria "solo por clasificación": sus clasificatorios cubren todo el cuadro, así que no hay
 * inscripción abierta al público. Los lugares que no se llenen quedan como pases libres.
 */
export function isQualifiersOnly(t: {
  format: string;
  maxParticipants: number | null;
  qualifiers: { fromRank: number; topN: number }[];
}) {
  if (t.format !== "KNOCKOUT" || !t.maxParticipants || t.qualifiers.length === 0) return false;
  return t.qualifiers.reduce((a, q) => a + qualifierSlots(q), 0) >= t.maxParticipants;
}
