import { prisma, type Db } from "@/server/db";
import { getActiveBan } from "@/server/users/bans";
import { effectiveStatus } from "@/server/league/lives";
import { getTournamentStats } from "./tournament-stats";

/**
 * Perfil que ve otro jugador: datos públicos, números generales, liga y torneos.
 * Nunca incluye mail, créditos, vidas ni estrellas. Un usuario baneado no tiene perfil visible.
 */
export async function getPublicProfile(username: string, now = new Date(), db: Db = prisma) {
  const user = await db.user.findFirst({
    where: { username: { equals: username.toLowerCase(), mode: "insensitive" } },
    select: { id: true, name: true, username: true, displayUsername: true, image: true, role: true, createdAt: true },
  });
  if (!user || (await getActiveBan(user.id, now, db))) return null;

  const finished = { userId: user.id, status: { in: ["FINISHED", "TIMED_OUT"] as ("FINISHED" | "TIMED_OUT")[] } };
  const [attempts, answered, memberships, standings, streaks, tournaments] = await Promise.all([
    db.attempt.aggregate({ where: finished, _count: true, _sum: { correctCount: true } }),
    db.attemptAnswer.count({ where: { attempt: finished } }),
    db.categoryMembership.findMany({
      where: { userId: user.id, status: { not: "LEFT" } },
      include: { category: { select: { id: true, name: true, slug: true, icon: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    db.categoryStanding.findMany({ where: { userId: user.id } }),
    db.streakState.findMany({ where: { userId: user.id } }),
    getTournamentStats(user.id, db),
  ]);

  const active = memberships.filter((m) => effectiveStatus(m, now) === "ACTIVE");
  const counts = active.length
    ? await db.categoryStanding.groupBy({ by: ["categoryId"], where: { categoryId: { in: active.map((m) => m.categoryId) } }, _count: true })
    : [];
  const league = active.map((m) => {
    const st = standings.find((s) => s.categoryId === m.categoryId);
    const streak = streaks.find((s) => s.categoryId === m.categoryId);
    return {
      category: m.category,
      joinedAt: m.joinedAt,
      rank: st?.rank ?? null,
      points: st?.points ?? null,
      participants: counts.find((c) => c.categoryId === m.categoryId)?._count ?? 0,
      streak: streak?.current ?? 0,
      bestStreak: streak?.best ?? 0,
    };
  });
  // Mejor racha histórica, también de categorías que ya dejó.
  const bestStreak = streaks.reduce((a, s) => Math.max(a, s.best), 0);

  return {
    user,
    stats: {
      quizzes: attempts._count,
      correct: attempts._sum.correctCount ?? 0,
      accuracy: answered ? Math.round((100 * (attempts._sum.correctCount ?? 0)) / answered) : null,
      activeCategories: active.length,
      bestStreak,
    },
    league,
    tournaments,
  };
}

export type PublicProfile = NonNullable<Awaited<ReturnType<typeof getPublicProfile>>>;
