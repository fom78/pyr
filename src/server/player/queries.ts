import { prisma } from "@/server/db";
import { getQuizStatus, STATUS_DISPLAY_ORDER } from "@/server/quiz/status";
import { effectiveStatus, leaveDates } from "@/server/league/lives";
import { getCategorySettings } from "@/server/config/service";

const DAY = 86_400_000;

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
    prisma.attempt.findMany({ where: { userId }, select: { quizId: true, status: true, id: true } }),
    prisma.tournament.findMany({
      where: { status: "PUBLISHED", registrationOpensAt: { lte: now }, registrationEndsAt: { gt: now }, id: { notIn: tournamentIds } },
      orderBy: { registrationEndsAt: "asc" },
      take: 3,
    }),
    prisma.attempt.findFirst({ where: { userId, status: "IN_PROGRESS" }, include: { quiz: true } }),
  ]);
  const played = new Map(attempts.map((a) => [a.quizId, a]));
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

/** Pantalla de una categoría: cuestionarios (vigentes primero), tabla y estado del usuario. */
export async function getCategoryPageData(slug: string, userId: string, now = new Date()) {
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return null;
  const [memberships, quizzes, standings, settings, myStreak] = await Promise.all([
    prisma.categoryMembership.findMany({ where: { userId, categoryId: category.id }, orderBy: { joinedAt: "desc" } }),
    prisma.quiz.findMany({
      where: { categoryId: category.id, tournamentId: null, publishedAt: { not: null } },
      include: { _count: { select: { questions: { where: { voided: false } }, attempts: true } } },
      orderBy: { opensAt: "desc" },
      take: 60,
    }),
    prisma.categoryStanding.findMany({
      where: { categoryId: category.id },
      orderBy: [{ rank: "asc" }, { userId: "asc" }],
      take: 100,
      include: { user: { select: { id: true, name: true, username: true, image: true } } },
    }),
    getCategorySettings(category),
    prisma.streakState.findUnique({ where: { userId_categoryId: { userId, categoryId: category.id } } }),
  ]);
  const attempts = await prisma.attempt.findMany({
    where: { userId, quizId: { in: quizzes.map((q) => q.id) } },
    select: { id: true, quizId: true, status: true, score: true, correctCount: true },
  });
  const byQuiz = new Map(attempts.map((a) => [a.quizId, a]));
  const withStatus = quizzes
    .map((q) => ({ ...q, derived: getQuizStatus(q, now), attempt: byQuiz.get(q.id) ?? null }))
    .sort((a, b) => STATUS_DISPLAY_ORDER[a.derived] - STATUS_DISPLAY_ORDER[b.derived] || (a.derived === "SCHEDULED" ? a.opensAt.getTime() - b.opensAt.getTime() : b.opensAt.getTime() - a.opensAt.getTime()));
  const current = memberships.find((m) => effectiveStatus(m, now) !== "LEFT") ?? null;
  const myStanding = standings.find((s) => s.userId === userId) ??
    (await prisma.categoryStanding.findUnique({
      where: { categoryId_userId: { categoryId: category.id, userId } },
      include: { user: { select: { id: true, name: true, username: true, image: true } } },
    }));
  return {
    category,
    membership: current ? { ...current, effective: effectiveStatus(current, now) } : null,
    lastLeft: memberships.find((m) => effectiveStatus(m, now) === "LEFT") ?? null,
    quizzes: withStatus,
    standings,
    myStanding,
    settings,
    streak: myStreak,
    /** Fechas que tendría si abandona ahora (para el diálogo de confirmación). */
    leavePreview: leaveDates(now, settings["league.leaveCooldownDays"], settings["league.rejoinBlockDays"]),
  };
}
