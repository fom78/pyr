import { prisma } from "@/server/db";
import { getQuizStatus, STATUS_DISPLAY_ORDER } from "@/server/quiz/status";
import { checkJoin, effectiveStatus, leaveDates } from "@/server/league/lives";
import { getLivesSummary } from "@/server/league/service";
import { getCategorySettings } from "@/server/config/service";
import { positionOf, sliceAround } from "@/server/ranking/compute";

const DAY = 86_400_000;
const FINISHED = ["FINISHED", "TIMED_OUT"] as const;
const STANDING_USER = { user: { select: { id: true, name: true, username: true, image: true } } } as const;

/** Datos de la pantalla de inicio del jugador. */
export async function getHomeData(userId: string, now = new Date()) {
  const memberships = await prisma.categoryMembership.findMany({
    where: { userId, status: { in: ["ACTIVE", "LEAVING"] } },
    include: { category: true },
    orderBy: { joinedAt: "asc" },
  });
  const active = memberships.filter((m) => effectiveStatus(m, now) === "ACTIVE");
  const categoryIds = active.map((m) => m.categoryId);
  const entries = await prisma.tournamentEntry.findMany({ where: { userId }, select: { tournamentId: true } });
  const tournamentIds = entries.map((e) => e.tournamentId);

  const [standings, streaks, quizzes, attempts, openTournaments, inProgress] = await Promise.all([
    prisma.categoryStanding.findMany({ where: { userId, categoryId: { in: categoryIds } } }),
    prisma.streakState.findMany({ where: { userId, categoryId: { in: categoryIds } } }),
    prisma.quiz.findMany({
      where: {
        publishedAt: { not: null },
        closesAt: { gt: now },
        opensAt: { lt: new Date(now.getTime() + 7 * DAY) },
        OR: [{ categoryId: { in: categoryIds }, tournamentId: null }, { tournamentId: { in: tournamentIds } }],
      },
      include: { category: true, tournament: true, _count: { select: { questions: { where: { voided: false } } } } },
      orderBy: { closesAt: "asc" },
    }),
    prisma.attempt.findMany({ where: { userId }, select: { quizId: true } }),
    prisma.tournament.findMany({
      where: { status: "PUBLISHED", registrationOpensAt: { lte: now }, registrationEndsAt: { gt: now }, id: { notIn: tournamentIds } },
      orderBy: { registrationEndsAt: "asc" },
      take: 3,
    }),
    prisma.attempt.findFirst({ where: { userId, status: "IN_PROGRESS" }, include: { quiz: true } }),
  ]);
  const played = new Set(attempts.map((a) => a.quizId));
  const pending = quizzes.filter((q) => getQuizStatus(q, now) === "ACTIVE" && !played.has(q.id));
  const upcoming = quizzes.filter((q) => getQuizStatus(q, now) === "SCHEDULED");

  return {
    memberships: memberships.map((m) => ({
      ...m,
      effective: effectiveStatus(m, now),
      standing: standings.find((s) => s.categoryId === m.categoryId) ?? null,
      streak: streaks.find((s) => s.categoryId === m.categoryId) ?? null,
    })),
    pending,
    upcoming,
    openTournaments,
    inProgress: inProgress && inProgress.deadlineAt > now ? inProgress : null,
  };
}

/**
 * Pantalla "Liga": todas las categorías activas con lo que le sirve al usuario.
 * Donde participa: su puesto, racha y la tabla alrededor suyo (2 arriba y 2 abajo).
 * Donde no: participantes, podio y cuándo hay cuestionario.
 */
export async function getLeagueOverview(userId: string, now = new Date()) {
  const [categories, lives] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: { where: { status: "ACTIVE" } } } } },
    }),
    getLivesSummary(userId, now),
  ]);
  const ids = categories.map((c) => c.id);
  const mine = new Map(
    lives.memberships.filter((m) => effectiveStatus(m, now) !== "LEFT").map((m) => [m.categoryId, { ...m, effective: effectiveStatus(m, now) }]),
  );
  const activeIds = ids.filter((id) => mine.get(id)?.effective === "ACTIVE");

  const [myStandings, streaks, podiums, quizzes] = await Promise.all([
    prisma.categoryStanding.findMany({ where: { userId, categoryId: { in: activeIds } } }),
    prisma.streakState.findMany({ where: { userId, categoryId: { in: activeIds } } }),
    prisma.categoryStanding.findMany({
      where: { categoryId: { in: ids }, rank: { lte: 3 } },
      orderBy: [{ rank: "asc" }, { userId: "asc" }],
      include: STANDING_USER,
    }),
    prisma.quiz.findMany({
      where: { categoryId: { in: ids }, tournamentId: null, publishedAt: { not: null }, closesAt: { gt: now } },
      select: { id: true, categoryId: true, publishedAt: true, opensAt: true, closesAt: true, expiresAt: true },
      orderBy: { opensAt: "asc" },
    }),
  ]);
  // Vecinos: filas con puesto cercano al mío (el corte exacto se hace en TS por si hay empates)
  const neighborRows = myStandings.length
    ? await prisma.categoryStanding.findMany({
        where: { OR: myStandings.map((s) => ({ categoryId: s.categoryId, rank: { gte: s.rank - 2, lte: s.rank + 2 } })) },
        orderBy: [{ rank: "asc" }, { userId: "asc" }],
        include: STANDING_USER,
      })
    : [];
  const played = new Set(
    (
      await prisma.attempt.findMany({ where: { userId, quizId: { in: quizzes.map((q) => q.id) } }, select: { quizId: true } })
    ).map((a) => a.quizId),
  );

  const items = await Promise.all(
    categories.map(async (c) => {
      const s = await getCategorySettings(c);
      const membership = mine.get(c.id) ?? null;
      const standing = myStandings.find((x) => x.categoryId === c.id) ?? null;
      const own = quizzes.filter((q) => q.categoryId === c.id);
      const active = own.filter((q) => getQuizStatus(q, now) === "ACTIVE");
      const next = own.find((q) => getQuizStatus(q, now) === "SCHEDULED") ?? null;
      return {
        category: c,
        participants: c._count.memberships,
        membership,
        join: checkJoin(lives.memberships, c.id, lives.max, now),
        standing,
        streak: streaks.find((x) => x.categoryId === c.id)?.current ?? 0,
        neighbors: standing ? sliceAround(neighborRows.filter((r) => r.categoryId === c.id), userId) : [],
        podium: podiums.filter((r) => r.categoryId === c.id),
        activeQuiz: active.length ? { closesAt: active[0].closesAt, unplayed: active.filter((q) => !played.has(q.id)).length } : null,
        nextOpensAt: next?.opensAt ?? null,
        bestK: s["ranking.bestK"],
        frequencyDays: s["quiz.frequencyDays"],
      };
    }),
  );
  // Primero donde participo (activa o en desvinculación), después el resto
  items.sort((a, b) => Number(Boolean(b.membership)) - Number(Boolean(a.membership)));
  return { items, lives };
}

/** Pantalla de una categoría: vigente, top 10 + mi fila, próximos, historial con datos y estado del usuario. */
export async function getCategoryPageData(slug: string, userId: string, now = new Date()) {
  const category = await prisma.category.findUnique({
    where: { slug },
    include: { _count: { select: { memberships: { where: { status: "ACTIVE" } } } } },
  });
  if (!category) return null;
  const [memberships, quizzes, top, settings, myStreak, myStanding, rankedCount] = await Promise.all([
    prisma.categoryMembership.findMany({ where: { userId, categoryId: category.id }, orderBy: { joinedAt: "desc" } }),
    prisma.quiz.findMany({
      where: { categoryId: category.id, tournamentId: null, publishedAt: { not: null } },
      include: { _count: { select: { questions: { where: { voided: false } } } } },
      orderBy: { opensAt: "desc" },
      take: 60,
    }),
    prisma.categoryStanding.findMany({
      where: { categoryId: category.id },
      orderBy: [{ rank: "asc" }, { userId: "asc" }],
      take: 10,
      include: STANDING_USER,
    }),
    getCategorySettings(category),
    prisma.streakState.findUnique({ where: { userId_categoryId: { userId, categoryId: category.id } } }),
    prisma.categoryStanding.findUnique({
      where: { categoryId_userId: { categoryId: category.id, userId } },
      include: STANDING_USER,
    }),
    prisma.categoryStanding.count({ where: { categoryId: category.id } }),
  ]);
  const quizIds = quizzes.map((q) => q.id);
  const [myAttempts, stats] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId, quizId: { in: quizIds } },
      select: { id: true, quizId: true, status: true, score: true, correctCount: true, totalTimeMs: true, finishedAt: true },
    }),
    prisma.attempt.groupBy({
      by: ["quizId"],
      where: { quizId: { in: quizIds }, status: { in: [...FINISHED] } },
      _count: { _all: true },
      _max: { score: true },
    }),
  ]);
  const byQuiz = new Map(myAttempts.map((a) => [a.quizId, a]));
  const statsByQuiz = new Map(stats.map((s) => [s.quizId, { participants: s._count._all, bestScore: s._max.score }]));

  const withStatus = quizzes
    .map((q) => ({
      ...q,
      derived: getQuizStatus(q, now),
      attempt: byQuiz.get(q.id) ?? null,
      participants: statsByQuiz.get(q.id)?.participants ?? 0,
      bestScore: statsByQuiz.get(q.id)?.bestScore ?? null,
    }))
    .sort(
      (a, b) =>
        STATUS_DISPLAY_ORDER[a.derived] - STATUS_DISPLAY_ORDER[b.derived] ||
        (a.derived === "SCHEDULED" ? a.opensAt.getTime() - b.opensAt.getTime() : b.opensAt.getTime() - a.opensAt.getTime()),
    );

  const HISTORY_SIZE = 10;
  const history = withStatus.filter((q) => q.derived === "CLOSED" || q.derived === "EXPIRED").slice(0, HISTORY_SIZE);
  // Mi puesto en cada cuestionario del historial que jugué
  const playedHistory = history.filter((q) => q.attempt && q.attempt.status !== "IN_PROGRESS");
  const historyResults = playedHistory.length
    ? await prisma.attempt.findMany({
        where: { quizId: { in: playedHistory.map((q) => q.id) }, status: { in: [...FINISHED] } },
        select: { quizId: true, score: true, correctCount: true, totalTimeMs: true, finishedAt: true },
      })
    : [];
  const myPosition = new Map(
    playedHistory.map((q) => [q.id, positionOf(q.attempt!, historyResults.filter((r) => r.quizId === q.id))]),
  );

  const current = memberships.find((m) => effectiveStatus(m, now) !== "LEFT") ?? null;
  return {
    category,
    participants: category._count.memberships,
    rankedCount,
    membership: current ? { ...current, effective: effectiveStatus(current, now) } : null,
    lastLeft: memberships.find((m) => effectiveStatus(m, now) === "LEFT") ?? null,
    active: withStatus.filter((q) => q.derived === "ACTIVE"),
    upcoming: withStatus.filter((q) => q.derived === "SCHEDULED"),
    history: history.map((q) => ({ ...q, position: myPosition.get(q.id) ?? null })),
    hasMoreHistory: withStatus.filter((q) => q.derived === "CLOSED" || q.derived === "EXPIRED").length > HISTORY_SIZE,
    top,
    myStanding,
    settings,
    streak: myStreak,
    /** Fechas que tendría si abandona ahora (para el diálogo de confirmación). */
    leavePreview: leaveDates(now, settings["league.leaveCooldownDays"], settings["league.rejoinBlockDays"]),
  };
}

/** Tabla completa de una categoría (top 100 + la fila del usuario si quedó afuera). */
export async function getCategoryStandingsPage(slug: string, userId: string) {
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return null;
  const [standings, myStanding, total, settings] = await Promise.all([
    prisma.categoryStanding.findMany({
      where: { categoryId: category.id },
      orderBy: [{ rank: "asc" }, { userId: "asc" }],
      take: 100,
      include: STANDING_USER,
    }),
    prisma.categoryStanding.findUnique({ where: { categoryId_userId: { categoryId: category.id, userId } }, include: STANDING_USER }),
    prisma.categoryStanding.count({ where: { categoryId: category.id } }),
    getCategorySettings(category),
  ]);
  return { category, standings, myStanding, total, settings };
}
