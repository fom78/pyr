import { prisma, type Db } from "@/server/db";
import { getCategorySettings } from "@/server/config/service";
import { activeBanWhere } from "@/server/users/bans";
import { computeLeagueStandings, computeTournamentStandings, type StandingRow } from "./compute";
import { logger } from "@/server/logger";

const DAY = 86_400_000;
const FINISHED = ["FINISHED", "TIMED_OUT"] as const;

async function bannedUserIds(now: Date, db: Db) {
  const bans = await db.ban.findMany({ where: activeBanWhere(now), select: { userId: true } });
  return new Set(bans.map((b) => b.userId));
}

/** previousRank solo cambia cuando cambia el puesto (así la tendencia sobrevive a recálculos sin cambios). */
function withTrend(rows: StandingRow[], prev: Map<string, { rank: number; previousRank: number | null }>) {
  return rows.map((r) => {
    const old = prev.get(r.userId);
    const previousRank = !old ? null : old.rank !== r.rank ? old.rank : old.previousRank;
    return { ...r, previousRank };
  });
}

/**
 * Tabla de una categoría: mejores K de cada usuario entre los cuestionarios de liga computables
 * (CLOSED, no EXPIRED) cerrados dentro de la ventana. Solo inscriptos activos y no baneados.
 */
export async function recomputeCategoryStandings(categoryId: string, now = new Date(), db: Db = prisma) {
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category) return;
  const s = await getCategorySettings(category, db);
  const windowStart = new Date(now.getTime() - s["ranking.windowDays"] * DAY);

  const [quizzes, members, banned] = await Promise.all([
    db.quiz.findMany({
      where: {
        categoryId,
        tournamentId: null,
        publishedAt: { not: null },
        closesAt: { lte: now, gte: windowStart },
        expiresAt: { gt: now },
      },
      select: { id: true },
    }),
    db.categoryMembership.findMany({ where: { categoryId, status: "ACTIVE" }, select: { userId: true } }),
    bannedUserIds(now, db),
  ]);
  const eligible = members.map((m) => m.userId).filter((id) => !banned.has(id));

  const attempts = quizzes.length && eligible.length
    ? await db.attempt.findMany({
        where: { quizId: { in: quizzes.map((q) => q.id) }, userId: { in: eligible }, status: { in: [...FINISHED] } },
        select: { userId: true, quizId: true, score: true, correctCount: true, totalTimeMs: true, finishedAt: true },
      })
    : [];

  const rows = computeLeagueStandings(attempts, s["ranking.bestK"]);
  const prev = new Map(
    (await db.categoryStanding.findMany({ where: { categoryId }, select: { userId: true, rank: true, previousRank: true } })).map(
      (p) => [p.userId, p],
    ),
  );
  const data = withTrend(rows, prev).map((r) => ({
    categoryId,
    userId: r.userId,
    rank: r.rank,
    previousRank: r.previousRank,
    points: r.points,
    quizzesCounted: r.quizzesCounted,
    correctCount: r.correctCount,
    totalTimeMs: r.totalTimeMs,
    computedAt: now,
  }));

  const run = async (tx: Db) => {
    await tx.categoryStanding.deleteMany({ where: { categoryId } });
    if (data.length) await tx.categoryStanding.createMany({ data });
  };
  if ("$transaction" in db) await db.$transaction(run);
  else await run(db);
  logger.debug({ categoryId, rows: data.length }, "tabla de categoría recalculada");
}

/** Tabla de torneo: suma de todos los cuestionarios del torneo (con comodines ya aplicados). */
export async function recomputeTournamentStandings(tournamentId: string, now = new Date(), db: Db = prisma) {
  const [entries, quizzes, banned] = await Promise.all([
    db.tournamentEntry.findMany({ where: { tournamentId }, select: { userId: true } }),
    db.quiz.findMany({ where: { tournamentId, publishedAt: { not: null } }, select: { id: true } }),
    bannedUserIds(now, db),
  ]);
  const eligible = entries.map((e) => e.userId).filter((id) => !banned.has(id));
  const attempts = quizzes.length && eligible.length
    ? await db.attempt.findMany({
        where: { quizId: { in: quizzes.map((q) => q.id) }, userId: { in: eligible }, status: { in: [...FINISHED] } },
        select: { userId: true, quizId: true, score: true, correctCount: true, totalTimeMs: true, finishedAt: true },
      })
    : [];
  const rows = computeTournamentStandings(attempts);
  const prev = new Map(
    (await db.tournamentStanding.findMany({ where: { tournamentId }, select: { userId: true, rank: true, previousRank: true } })).map(
      (p) => [p.userId, p],
    ),
  );
  const data = withTrend(rows, prev).map((r) => ({
    tournamentId,
    userId: r.userId,
    rank: r.rank,
    previousRank: r.previousRank,
    points: r.points,
    quizzesCounted: r.quizzesCounted,
    correctCount: r.correctCount,
    totalTimeMs: r.totalTimeMs,
    computedAt: now,
  }));
  const run = async (tx: Db) => {
    await tx.tournamentStanding.deleteMany({ where: { tournamentId } });
    if (data.length) await tx.tournamentStanding.createMany({ data });
  };
  if ("$transaction" in db) await db.$transaction(run);
  else await run(db);
}

export async function recomputeAllStandings(now = new Date(), db: Db = prisma) {
  const [categories, tournaments] = await Promise.all([
    db.category.findMany({ select: { id: true } }),
    db.tournament.findMany({ where: { status: { in: ["PUBLISHED", "FINISHED"] } }, select: { id: true } }),
  ]);
  for (const c of categories) await recomputeCategoryStandings(c.id, now, db);
  for (const t of tournaments) await recomputeTournamentStandings(t.id, now, db);
}

/** Recalcula las tablas afectadas por un cuestionario. */
export async function recomputeForQuiz(quiz: { categoryId: string | null; tournamentId: string | null }, now = new Date(), db: Db = prisma) {
  if (quiz.tournamentId) await recomputeTournamentStandings(quiz.tournamentId, now, db);
  else if (quiz.categoryId) await recomputeCategoryStandings(quiz.categoryId, now, db);
}
