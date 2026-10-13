import { prisma } from "@/server/db";
import { logger } from "@/server/logger";
import { fillIncompleteDrafts, generateDrafts, handleDueDrafts, notifyCoverage, notifyDrafts, rescueSlots } from "@/server/autoquiz/service";
import { expireStaleAttempts } from "@/server/game/engine";
import { releaseExpiredLeaves } from "@/server/league/service";
import { recomputeAllStandings, recomputeForQuiz } from "@/server/ranking/service";
import { purgeRateBuckets } from "@/server/ratelimit";
import { finishDueTournaments } from "@/server/tournaments/service";
import { notifyReviewReady } from "@/server/quiz/review-notify";
import { notifyQuizOpened, notifyStreakRisk, sendWeeklySummaries } from "@/server/notifications/player";
import { ensureCoverVariants } from "@/server/storage/images";
import { runPendingBackups, scheduleNightlyBackup } from "@/server/backups/service";
import { autoCloseAnswered } from "@/server/tickets/service";

/**
 * Sincroniza la columna caché Quiz.status con lo que dicen las fechas y recalcula las tablas
 * afectadas cuando un cuestionario pasa a CLOSED (empieza a computar) o EXPIRED (deja de computar).
 */
export async function syncQuizStatuses(now = new Date()) {
  const changed = await prisma.$queryRaw<{ id: string; status: string; categoryId: string | null; tournamentId: string | null }[]>`
    UPDATE "Quiz" q SET status = s.new_status::"QuizStatus", "updatedAt" = now()
    FROM (
      SELECT id, CASE
        WHEN "publishedAt" IS NULL THEN 'DRAFT'
        WHEN ${now} < "opensAt" THEN 'SCHEDULED'
        WHEN ${now} < "closesAt" THEN 'ACTIVE'
        WHEN ${now} < "expiresAt" THEN 'CLOSED'
        ELSE 'EXPIRED' END AS new_status
      FROM "Quiz"
    ) s
    WHERE q.id = s.id AND q.status::text <> s.new_status
    RETURNING q.id, q.status::text AS status, q."categoryId", q."tournamentId"`;
  const affected = changed.filter((c) => c.status === "CLOSED" || c.status === "EXPIRED");
  // Una tabla por categoría/torneo, aunque cambien varios quizzes juntos.
  const seen = new Set<string>();
  for (const q of affected) {
    const key = q.tournamentId ? `t:${q.tournamentId}` : `c:${q.categoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await recomputeForQuiz(q, now);
  }
  if (changed.length) logger.info({ changed: changed.length, recomputed: seen.size }, "estados de cuestionarios sincronizados");
  // Al cerrar un cuestionario, los intentos colgados se cierran
  return changed.length;
}

/** Calendarios automáticos: primero vencimientos (publicar o descartar), después generar y avisar. */
async function runAutoQuizzes(now = new Date()) {
  // Primero se completan los que quedaron cortos (los más próximos tienen prioridad sobre los turnos nuevos),
  // así un borrador recién completado ya puede publicarse solo en esta misma pasada.
  const filled = await fillIncompleteDrafts(now);
  const due = await handleDueDrafts(now);
  const generated = await generateDrafts(now);
  // Turnos urgentes sin cuestionario: se arman y publican solos si la categoría lo permite (antes de avisar).
  const rescued = await rescueSlots(now);
  const notified = await notifyDrafts(now);
  return { ...due, ...filled, ...generated, ...rescued, notified: notified.sent };
}

async function runCoverVariants() {
  const [categories, tournaments] = await Promise.all([
    prisma.category.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
    prisma.tournament.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
  ]);
  const created = await ensureCoverVariants([...categories, ...tournaments].map((x) => x.imageKey!));
  return { created };
}

export const tasks = {
  "quiz-status-sync": { cron: "* * * * *", run: () => syncQuizStatuses() },
  // Al cerrar un cuestionario: "ya podés ver la corrección" a quienes lo jugaron.
  "review-ready": { cron: "* * * * *", run: () => notifyReviewReady() },
  // Al abrir un cuestionario de liga: "nuevo cuestionario disponible" a los participantes.
  "quiz-opened": { cron: "* * * * *", run: () => notifyQuizOpened() },
  // Racha en riesgo: cierra pronto uno que el jugador todavía no jugó.
  "streak-risk": { cron: "*/15 * * * *", run: () => notifyStreakRisk() },
  // Lunes a la mañana: puesto, racha y mejor puntaje de la semana.
  "weekly-summary": { cron: "0 9 * * 1", run: () => sendWeeklySummaries() },
  "attempts-expire": { cron: "* * * * *", run: () => expireStaleAttempts() },
  "memberships-release": { cron: "*/10 * * * *", run: () => releaseExpiredLeaves() },
  "tournaments-finish": { cron: "*/5 * * * *", run: () => finishDueTournaments() },
  // Recálculo completo diario: la ventana del ranking se desliza aunque no haya eventos.
  "standings-nightly": { cron: "15 3 * * *", run: () => recomputeAllStandings() },
  "ratelimit-purge": { cron: "0 * * * *", run: () => purgeRateBuckets() },
  autoquiz: { cron: "*/15 * * * *", run: () => runAutoQuizzes() },
  // Una vez por día en horario de trabajo: ¿alcanzan las preguntas nuevas para los próximos turnos?
  "bank-coverage": { cron: "0 9 * * *", run: () => notifyCoverage() },
  // Backups: los pedidos desde el panel (cada minuto) y el diario (base + imágenes, con retención).
  backups: { cron: "* * * * *", run: () => runPendingBackups() },
  "backup-nightly": { cron: "30 3 * * *", run: () => scheduleNightlyBackup() },
  // Tickets respondidos sin feedback del usuario: se cierran solos.
  "tickets-autoclose": { cron: "0 5 * * *", run: () => autoCloseAnswered() },
  // Variante chica de las portadas subidas antes de que existiera (idempotente).
  "cover-variants": { cron: "30 4 * * *", run: () => runCoverVariants() },
} as const;

export type TaskName = keyof typeof tasks;
