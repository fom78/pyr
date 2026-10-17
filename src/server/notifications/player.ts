import { prisma, type Db } from "@/server/db";
import { getCategorySettings, getSettings } from "@/server/config/service";
import { computeStreak } from "@/server/league/streak";
import { activeBanWhere } from "@/server/users/bans";
import { formatDateTime } from "@/lib/format";
import { notifyUsers } from "./service";
import { isSummaryDay, weekKey, weeklySummaryBody, type WeeklyCategoryStats } from "./weekly";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BATCH = 50;
/** Un cuestionario que abrió hace más que esto (worker caído) se marca sin avisar: ya no es "nuevo". */
const STALE_OPEN_MS = 12 * HOUR;
/** Racha mínima para avisar que está en riesgo. */
const MIN_RISK_STREAK = 2;
const STREAK_LOOKBACK = 400;
const FINISHED = ["FINISHED", "TIMED_OUT"] as const;

/** Participantes activos (no baneados) de una categoría. */
async function activeMembers(categoryId: string, now: Date, db: Db) {
  return db.categoryMembership.findMany({
    where: { categoryId, status: "ACTIVE", user: { bans: { none: activeBanWhere(now) } } },
    select: { userId: true, joinedAt: true },
  });
}

/** Racha actual de cada usuario en la categoría (misma regla que `updateStreak`, calculada a `now`). */
export async function currentStreaks(
  categoryId: string,
  members: { userId: string; joinedAt: Date }[],
  now: Date,
  db: Db = prisma,
) {
  const out = new Map<string, number>();
  if (!members.length) return out;
  const since = new Date(Math.min(...members.map((m) => m.joinedAt.getTime())));
  const quizzes = await db.quiz.findMany({
    where: { categoryId, tournamentId: null, publishedAt: { not: null }, closesAt: { gt: since } },
    orderBy: { closesAt: "desc" },
    take: STREAK_LOOKBACK,
    select: { id: true, closesAt: true },
  });
  const attempts = await db.attempt.findMany({
    where: { userId: { in: members.map((m) => m.userId) }, quizId: { in: quizzes.map((q) => q.id) }, status: { in: [...FINISHED] } },
    select: { userId: true, quizId: true },
  });
  const played = new Map<string, Set<string>>();
  for (const a of attempts) {
    if (!played.has(a.userId)) played.set(a.userId, new Set());
    played.get(a.userId)!.add(a.quizId);
  }
  for (const m of members) out.set(m.userId, computeStreak(quizzes, played.get(m.userId) ?? new Set(), now, m.joinedAt));
  return out;
}

/**
 * "Nuevo cuestionario disponible": cuando abre un cuestionario de liga, avisa a los participantes
 * de la categoría o a los inscriptos del torneo (`notify.newQuiz`). Idempotente: marca `openNotifiedAt` y deduplica por cuestionario.
 */
export async function notifyQuizOpened(now = new Date(), db: Db = prisma) {
  const due = await db.quiz.findMany({
    where: {
      publishedAt: { not: null },
      opensAt: { lte: now },
      openNotifiedAt: null,
      OR: [{ tournamentId: null, categoryId: { not: null } }, { tournament: { status: "PUBLISHED" } }],
    },
    include: {
      category: true,
      tournament: { select: { id: true, name: true, slug: true } },
      match: { select: { playerAId: true, playerBId: true } },
    },
    orderBy: { opensAt: "asc" },
    take: BATCH,
  });
  let sent = 0;
  for (const quiz of due) {
    const fresh = quiz.closesAt > now && now.getTime() - quiz.opensAt.getTime() < STALE_OPEN_MS;
    const body = `“${quiz.title}” ya está abierto. Podés jugarlo hasta el ${formatDateTime(quiz.closesAt)}.`;
    if (fresh && quiz.tournament) {
      // Torneo: a los inscriptos (no baneados).
      if ((await getSettings(db))["notify.newQuiz"]) {
        const entries = await db.tournamentEntry.findMany({
          where: {
            tournamentId: quiz.tournament.id,
            user: { bans: { none: activeBanWhere(now) } },
            // Partido de eliminatoria: solo sus dos jugadores.
            ...(quiz.match ? { userId: { in: [quiz.match.playerAId, quiz.match.playerBId].filter((x): x is string => Boolean(x)) } } : {}),
          },
          select: { userId: true },
        });
        sent += await notifyUsers(
          entries.map((e) => e.userId),
          {
            level: "INFO",
            kind: "quiz.opened",
            title: quiz.match ? `⚔️ Tu partido de ${quiz.tournament.name} ya está abierto` : `🏆 Nueva fecha en ${quiz.tournament.name}`,
            body,
            href: `/torneos/${quiz.tournament.slug}`,
            dedupeKey: `quiz.opened:${quiz.id}`,
          },
          db,
        );
      }
    } else if (fresh && quiz.category) {
      const category = quiz.category;
      if ((await getCategorySettings(category, db))["notify.newQuiz"]) {
        const members = await activeMembers(category.id, now, db);
        sent += await notifyUsers(
          members.map((m) => m.userId),
          {
            level: "INFO",
            kind: "quiz.opened",
            title: `${category.icon ? `${category.icon} ` : ""}Nuevo cuestionario en ${category.name}`,
            body,
            href: `/categorias/${category.slug}`,
            dedupeKey: `quiz.opened:${quiz.id}`,
          },
          db,
        );
      }
    }
    await db.quiz.update({ where: { id: quiz.id }, data: { openNotifiedAt: now } });
  }
  return { quizzes: due.length, sent };
}

/**
 * Racha en riesgo: `notify.streakRiskHours` antes de que cierre un cuestionario de liga, avisa a quien
 * tiene una racha de 2 o más en la categoría y todavía no lo jugó (si cierra sin jugarlo, la racha se corta).
 */
export async function notifyStreakRisk(now = new Date(), db: Db = prisma) {
  const hours = (await getSettings(db))["notify.streakRiskHours"];
  if (!hours) return { quizzes: 0, sent: 0 };
  const quizzes = await db.quiz.findMany({
    where: {
      publishedAt: { not: null },
      tournamentId: null,
      categoryId: { not: null },
      opensAt: { lte: now },
      closesAt: { gt: now, lte: new Date(now.getTime() + hours * HOUR) },
    },
    select: { id: true, title: true, closesAt: true, category: { select: { id: true, name: true, slug: true } } },
  });
  let sent = 0;
  for (const quiz of quizzes) {
    const category = quiz.category!;
    const members = await activeMembers(category.id, now, db);
    // La racha guardada nunca es menor que la real (solo sube al jugar): sirve de filtro barato.
    const stored = await db.streakState.findMany({
      where: { categoryId: category.id, userId: { in: members.map((m) => m.userId) }, current: { gte: MIN_RISK_STREAK } },
      select: { userId: true },
    });
    const withStreak = new Set(stored.map((x) => x.userId));
    const started = await db.attempt.findMany({ where: { quizId: quiz.id, userId: { in: [...withStreak] } }, select: { userId: true } });
    const startedIds = new Set(started.map((a) => a.userId));
    const candidates = members.filter((m) => withStreak.has(m.userId) && !startedIds.has(m.userId));
    if (!candidates.length) continue;
    const streaks = await currentStreaks(category.id, candidates, now, db);
    const left = Math.max(1, Math.round((quiz.closesAt.getTime() - now.getTime()) / HOUR));
    for (const [userId, streak] of streaks) {
      if (streak < MIN_RISK_STREAK) continue;
      sent += await notifyUsers(
        [userId],
        {
          level: "WARNING",
          kind: "streak.risk",
          title: `${category.name}: tu racha de ${streak} está en riesgo`,
          body: `“${quiz.title}” cierra en ${left} h y todavía no lo jugaste. Si cierra sin jugarlo, la racha vuelve a 0.`,
          href: `/categorias/${category.slug}`,
          dedupeKey: `streak.risk:${quiz.id}`,
        },
        db,
      );
    }
  }
  return { quizzes: quizzes.length, sent };
}

/**
 * Resumen semanal (`notify.weeklySummary`): puesto, racha y mejor puntaje de los últimos 7 días por categoría.
 * Solo los lunes (`isSummaryDay`) salvo `force`; uno por semana y usuario.
 */
export async function sendWeeklySummaries(now = new Date(), db: Db = prisma, opts: { force?: boolean } = {}) {
  if (!opts.force && !isSummaryDay(now)) return { users: 0, sent: 0 };
  if (!(await getSettings(db))["notify.weeklySummary"]) return { users: 0, sent: 0 };
  const memberships = await db.categoryMembership.findMany({
    where: { status: "ACTIVE", category: { active: true }, user: { bans: { none: activeBanWhere(now) } } },
    select: { userId: true, joinedAt: true, categoryId: true, category: { select: { name: true, icon: true } } },
  });
  const byCategory = new Map<string, typeof memberships>();
  for (const m of memberships) {
    if (!byCategory.has(m.categoryId)) byCategory.set(m.categoryId, []);
    byCategory.get(m.categoryId)!.push(m);
  }
  const perUser = new Map<string, WeeklyCategoryStats[]>();
  for (const [categoryId, members] of byCategory) {
    const ids = members.map((m) => m.userId);
    const [standings, ranked, streaks, week] = await Promise.all([
      db.categoryStanding.findMany({ where: { categoryId, userId: { in: ids } }, select: { userId: true, rank: true } }),
      db.categoryStanding.count({ where: { categoryId } }),
      currentStreaks(categoryId, members, now, db),
      db.attempt.groupBy({
        by: ["userId"],
        where: {
          userId: { in: ids },
          status: { in: [...FINISHED] },
          finishedAt: { gt: new Date(now.getTime() - 7 * DAY), lte: now },
          quiz: { categoryId, tournamentId: null },
        },
        _max: { score: true },
        _count: { _all: true },
      }),
    ]);
    const rank = new Map(standings.map((x) => [x.userId, x.rank]));
    const played = new Map(week.map((w) => [w.userId, w]));
    for (const m of members) {
      const w = played.get(m.userId);
      if (!perUser.has(m.userId)) perUser.set(m.userId, []);
      perUser.get(m.userId)!.push({
        name: m.category.name,
        icon: m.category.icon,
        rank: rank.get(m.userId) ?? null,
        ranked,
        streak: streaks.get(m.userId) ?? 0,
        played: w?._count._all ?? 0,
        bestScore: w?._max.score ?? null,
      });
    }
  }
  let sent = 0;
  const key = weekKey(now);
  for (const [userId, list] of perUser) {
    list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    sent += await notifyUsers(
      [userId],
      {
        level: "INFO",
        kind: "weekly.summary",
        title: "Tu semana en la liga",
        body: weeklySummaryBody(list),
        href: "/categorias",
        dedupeKey: `weekly:${key}`,
      },
      db,
    );
  }
  return { users: perUser.size, sent };
}
