import type { QuizStatus } from "@/generated/prisma/enums";

export type QuizTiming = {
  publishedAt: Date | null;
  opensAt: Date;
  closesAt: Date;
  expiresAt: Date;
};

/**
 * Fuente de verdad del ciclo de vida: se deriva de las fechas, así no dependemos del cron.
 * DRAFT → SCHEDULED → ACTIVE → CLOSED (computable) → EXPIRED (historial).
 */
export function getQuizStatus(q: QuizTiming, now: Date = new Date()): QuizStatus {
  if (!q.publishedAt) return "DRAFT";
  const t = now.getTime();
  if (t < q.opensAt.getTime()) return "SCHEDULED";
  if (t < q.closesAt.getTime()) return "ACTIVE";
  if (t < q.expiresAt.getTime()) return "CLOSED";
  return "EXPIRED";
}

export function isPlayable(q: QuizTiming, now = new Date()) {
  return getQuizStatus(q, now) === "ACTIVE";
}

export function isComputable(q: QuizTiming, now = new Date()) {
  return getQuizStatus(q, now) === "CLOSED";
}

/** Errores de validación de fechas (vacío = ok). `within` = vigencia del torneo. */
export function validateQuizTiming(
  q: { opensAt: Date; closesAt: Date; expiresAt: Date },
  within?: { startsAt: Date; endsAt: Date },
): string[] {
  const errors: string[] = [];
  if (!(q.opensAt < q.closesAt)) errors.push("La fecha de cierre debe ser posterior a la de apertura.");
  if (!(q.closesAt <= q.expiresAt)) errors.push("El fin del período computable no puede ser anterior al cierre.");
  if (within) {
    if (q.opensAt < within.startsAt || q.closesAt > within.endsAt)
      errors.push("El cuestionario debe abrir y cerrar dentro de la vigencia del torneo.");
  }
  return errors;
}

/** Orden de listado para el usuario: vigentes primero, luego próximos, luego historial. */
export const STATUS_DISPLAY_ORDER: Record<QuizStatus, number> = {
  ACTIVE: 0,
  SCHEDULED: 1,
  CLOSED: 2,
  EXPIRED: 3,
  DRAFT: 4,
};

export const STATUS_LABEL: Record<QuizStatus, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Próximamente",
  ACTIVE: "Vigente",
  CLOSED: "Cerrado",
  EXPIRED: "Historial",
};
