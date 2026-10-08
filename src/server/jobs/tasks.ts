import { prisma } from "@/server/db";
import { logger } from "@/server/logger";
import { expireStaleAttempts } from "@/server/game/engine";
import { releaseExpiredLeaves } from "@/server/league/service";
import { recomputeAllStandings, recomputeForQuiz } from "@/server/ranking/service";
import { purgeRateBuckets } from "@/server/ratelimit";
import { finishDueTournaments } from "@/server/tournaments/service";

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

export const tasks = {
  "quiz-status-sync": { cron: "* * * * *", run: () => syncQuizStatuses() },
  "attempts-expire": { cron: "* * * * *", run: () => expireStaleAttempts() },
  "memberships-release": { cron: "*/10 * * * *", run: () => releaseExpiredLeaves() },
  "tournaments-finish": { cron: "*/5 * * * *", run: () => finishDueTournaments() },
  // Recálculo completo diario: la ventana del ranking se desliza aunque no haya eventos.
  "standings-nightly": { cron: "15 3 * * *", run: () => recomputeAllStandings() },
  "ratelimit-purge": { cron: "0 * * * *", run: () => purgeRateBuckets() },
} as const;

export type TaskName = keyof typeof tasks;
