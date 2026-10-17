import { randomInt } from "node:crypto";
import { prisma, type Db } from "@/server/db";
import { Prisma, type KnockoutMatch, type QuestionSource, type Tournament } from "@/generated/prisma/client";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { logger } from "@/server/logger";
import { getSettings } from "@/server/config/service";
import { notifyStaff, notifyUsers } from "@/server/notifications/service";
import { activeBanWhere } from "@/server/users/bans";
import { loadCandidates } from "@/server/autoquiz/service";
import { finalizeAttempt } from "@/server/game/engine";
import { getQuizStatus } from "@/server/quiz/status";
import { percentile, summarizeResults } from "@/server/player/tournament-summary";
import { formatDateTime } from "@/lib/format";
import { pickAcrossCategories, type CategoryPool } from "./pick";
import type { Pick } from "@/server/autoquiz/pick";
import {
  bracketSize,
  decideMatch,
  finalRanks,
  firstRoundPairs,
  nextSlot,
  roundName,
  matchQuestionSplit,
  roundsFor,
  sample,
  seedPlayers,
  type MatchSide,
} from "./bracket";
import { cancelTournament, finishTournament } from "./service";

/**
 * Eliminatorias (formato KNOCKOUT). Ciclo:
 *  1. Inscripción: abierta (con costo) + clasificados de otros torneos (gratis, al terminar el origen).
 *  2. Al cerrar la inscripción se siembra y se arma el cuadro completo; los pases libres se deciden en el acto.
 *  3. Cada partido tiene su propio cuestionario (el mismo para los dos, mezclado), que se arma cuando se
 *     conocen ambos jugadores. El resultado se decide cuando los dos terminan o, al cierre, por W.O.
 *  4. Al decidirse la final, `finishTournament` reparte premios por ronda alcanzada (`finalRanks`).
 */

const HOUR = 3_600_000;
const FINISHED = ["FINISHED", "TIMED_OUT"] as const;

// ───────────────────────── Cupos y clasificados ─────────────────────────

/** Cupo de la inscripción abierta: tope − inscriptos − lugares reservados a torneos de origen que no terminaron. */
export async function knockoutCapacity(tournamentId: string, db: Db = prisma) {
  // En serie: puede correr dentro de una transacción (no admite consultas en paralelo).
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { maxParticipants: true } });
  const entries = await db.tournamentEntry.count({ where: { tournamentId } });
  const pending = await db.tournamentQualifier.aggregate({
    where: { tournamentId, appliedAt: null, source: { status: { in: ["DRAFT", "PUBLISHED"] } } },
    _sum: { topN: true },
  });
  const max = t.maxParticipants ?? 0;
  const reserved = pending._sum.topN ?? 0;
  return { max, entries, reserved, open: Math.max(0, max - entries - reserved) };
}

/**
 * Al terminar un torneo: inscribe a sus primeros N en las eliminatorias que lo tienen como clasificatorio.
 * Se saltean los baneados y los que ya están inscriptos (si su puesto acá es mejor, se les anota para la
 * siembra): ese lugar pasa al siguiente de la tabla. Con `autoConfirmQualified` quedan confirmados.
 */
export async function applyQualifiers(sourceId: string, now = new Date(), db: Db = prisma) {
  const qualifiers = await db.tournamentQualifier.findMany({
    where: { sourceTournamentId: sourceId, appliedAt: null },
    include: { tournament: true, source: { select: { name: true } } },
  });
  let added = 0;
  for (const q of qualifiers) {
    const t = q.tournament;
    if (t.status !== "PUBLISHED" && t.status !== "DRAFT") continue;
    if (t.registrationEndsAt <= now) {
      await db.tournamentQualifier.update({ where: { id: q.id }, data: { appliedAt: now } });
      continue;
    }
    const results = await db.tournamentResult.findMany({
      where: { tournamentId: sourceId, user: { bans: { none: activeBanWhere(now) } } },
      orderBy: [{ rank: "asc" }, { points: "desc" }],
    });
    const fresh: string[] = [];
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${t.id} FOR UPDATE`;
      let entries = await tx.tournamentEntry.count({ where: { tournamentId: t.id } });
      for (const r of results) {
        if (fresh.length >= q.topN || (t.maxParticipants && entries >= t.maxParticipants)) break;
        const existing = await tx.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId: r.userId } } });
        if (existing) {
          if (existing.qualifiedRank == null || existing.qualifiedRank > r.rank)
            await tx.tournamentEntry.update({ where: { id: existing.id }, data: { qualifiedFromId: sourceId, qualifiedRank: r.rank } });
          continue;
        }
        await tx.tournamentEntry.create({
          data: {
            tournamentId: t.id,
            userId: r.userId,
            enrolledAt: now,
            qualifiedFromId: sourceId,
            qualifiedRank: r.rank,
            confirmedAt: t.autoConfirmQualified ? now : null,
          },
        });
        fresh.push(r.userId);
        entries++;
      }
      await tx.tournamentQualifier.update({ where: { id: q.id }, data: { appliedAt: now } });
    });
    added += fresh.length;
    if (fresh.length)
      await notifyUsers(
        fresh,
        {
          level: "INFO",
          kind: "knockout.qualified",
          title: `🎟️ Clasificaste a ${t.name}`,
          body: t.autoConfirmQualified
            ? `Por tu puesto en ${q.source.name} ya tenés tu lugar (gratis). Empieza el ${formatDateTime(t.startsAt)}.`
            : `Por tu puesto en ${q.source.name} tenés un lugar gratis: confirmalo antes del ${formatDateTime(t.registrationEndsAt)}.`,
          href: `/torneos/${t.slug}`,
          dedupeKey: `knockout.qualified:${t.id}`,
        },
        db,
      );
  }
  return added;
}

/** El clasificado confirma su lugar (gratis). */
export async function confirmQualification(userId: string, tournamentId: string, now = new Date()) {
  const entry = await prisma.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId, userId } }, include: { tournament: true } });
  if (!entry) throw new NotFoundError("Inscripción");
  if (entry.confirmedAt) throw new UserError("Tu lugar ya está confirmado.");
  if (entry.tournament.registrationEndsAt <= now) throw new UserError("La inscripción ya cerró.");
  await prisma.tournamentEntry.update({ where: { id: entry.id }, data: { confirmedAt: now } });
}

// ───────────────────────── Cuadro ─────────────────────────

/**
 * Cierra la inscripción y arma el cuadro: descarta clasificados sin confirmar, siembra, crea todos los
 * partidos (ronda r abre en startsAt + (r−1) × frequencyHours) y decide los pases libres.
 * Con menos de 2 jugadores se cancela (con reintegro).
 */
export async function buildBracket(tournamentId: string, now = new Date(), rng: () => number = () => randomInt(1 << 30) / (1 << 30)) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t || t.format !== "KNOCKOUT" || t.status !== "PUBLISHED") return false;
  if ((await prisma.knockoutMatch.count({ where: { tournamentId } })) > 0) return false;

  const dropped = await prisma.tournamentEntry.findMany({ where: { tournamentId, confirmedAt: null }, select: { id: true } });
  if (dropped.length) await prisma.tournamentEntry.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } });
  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId, user: { bans: { none: activeBanWhere(now) } } },
    orderBy: { enrolledAt: "asc" },
  });
  if (entries.length < 2) {
    await cancelTournament(tournamentId, "No hubo suficientes inscriptos para armar el cuadro.", { id: null });
    return false;
  }

  // Siembra
  const [sources, history] = await Promise.all([
    prisma.tournamentResult.findMany({
      where: { OR: entries.filter((e) => e.qualifiedFromId).map((e) => ({ tournamentId: e.qualifiedFromId!, userId: e.userId })) },
    }),
    prisma.tournamentResult.findMany({ where: { userId: { in: entries.map((e) => e.userId) } } }),
  ]);
  const order = seedPlayers(
    entries.map((e) => {
      const src = sources.find((s) => s.tournamentId === e.qualifiedFromId && s.userId === e.userId);
      const mine = history.filter((h) => h.userId === e.userId);
      return {
        userId: e.userId,
        qualifiedRank: e.qualifiedRank,
        sourcePercentile: src ? percentile(src.rank, src.participants) : null,
        avgPercentile: mine.length ? summarizeResults(mine).avgPercentile : null,
      };
    }),
    t.seeding,
    rng,
  );
  const size = bracketSize(order.length, t.maxParticipants ?? 256);
  const rounds = roundsFor(size);
  const window = (r: number) => {
    const opensAt = new Date(t.startsAt.getTime() + (r - 1) * t.frequencyHours * HOUR);
    return { opensAt, closesAt: new Date(opensAt.getTime() + t.frequencyHours * HOUR) };
  };
  const pairs = firstRoundPairs(order.length, size);
  const user = (seed: number | null) => (seed ? order[seed - 1] : null);

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
    if ((await tx.knockoutMatch.count({ where: { tournamentId } })) > 0) return false;
    for (const [i, userId] of order.entries())
      await tx.tournamentEntry.update({ where: { tournamentId_userId: { tournamentId, userId } }, data: { seed: i + 1 } });
    const rows: Prisma.KnockoutMatchCreateManyInput[] = [];
    for (let r = 1; r <= rounds; r++) {
      const count = size / 2 ** r;
      for (let p = 0; p < count; p++) {
        const base = { tournamentId, round: r, position: p, ...window(r) };
        if (r === 1) {
          const [a, b] = pairs[p];
          rows.push({ ...base, playerAId: user(a), seedA: a, playerBId: user(b), seedB: b });
        } else rows.push(base);
      }
    }
    if (t.thirdPlaceMatch && rounds >= 2) rows.push({ tournamentId, round: rounds, position: 1, ...window(rounds) });
    await tx.knockoutMatch.createMany({ data: rows });
    await tx.tournament.update({ where: { id: tournamentId }, data: { quizCount: rounds, endsAt: window(rounds).closesAt } });
    return true;
  });
  if (!created) return false;

  // Pases libres: el mejor sembrado pasa directo.
  const byes = await prisma.knockoutMatch.findMany({ where: { tournamentId, round: 1, playerBId: null } });
  for (const m of byes) await advance(m, m.playerAId!, null, "BYE", now);
  await ensureMatchQuizzes(tournamentId, now);
  await logAudit({ actorId: null, action: "tournament.bracket", entityType: "Tournament", entityId: tournamentId, meta: { players: order.length, size, dropped: dropped.length } });
  logger.info({ tournamentId, players: order.length, size }, "cuadro de eliminatoria armado");
  return true;
}

/** Registra el resultado de un partido y lleva al ganador (y al perdedor de semifinal, si hay tercer puesto) al siguiente. */
async function advance(m: KnockoutMatch, winnerId: string, loserId: string | null, result: KnockoutMatch["result"] & string, now: Date) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: m.tournamentId } });
  const rounds = t.quizCount;
  const done = await prisma.$transaction(async (tx) => {
    const ok = await tx.knockoutMatch.updateMany({ where: { id: m.id, winnerId: null }, data: { winnerId, result, decidedAt: now } });
    if (!ok.count) return false;
    const seedOf = (id: string | null) => (id === m.playerAId ? m.seedA : m.seedB);
    const place = async (round: number, position: number, side: "A" | "B", userId: string) =>
      tx.knockoutMatch.update({
        where: { tournamentId_round_position: { tournamentId: m.tournamentId, round, position } },
        data: side === "A" ? { playerAId: userId, seedA: seedOf(userId) } : { playerBId: userId, seedB: seedOf(userId) },
      });
    if (m.round < rounds) {
      const next = nextSlot(m.round, m.position);
      await place(next.round, next.position, next.side, winnerId);
      if (loserId && t.thirdPlaceMatch && m.round === rounds - 1) await place(rounds, 1, next.side, loserId);
    }
    return true;
  });
  if (!done || result === "BYE") return done;

  const name = roundName(m.round, rounds, m.position);
  const how = result === "WALKOVER" ? " (W.O.)" : result === "TIEBREAK" ? " (por desempate)" : "";
  const isFinal = m.round === rounds;
  await notifyUsers(
    [winnerId],
    {
      level: "INFO",
      kind: "knockout.result",
      title: isFinal ? (m.position === 0 ? `🏆 ¡Ganaste ${t.name}!` : `🥉 Ganaste el tercer puesto en ${t.name}`) : `✅ Pasaste de ronda en ${t.name}`,
      body: `Ganaste ${name === "Tercer puesto" ? "el partido por el tercer puesto" : `la ${name.toLowerCase()}`}${how}.`,
      href: `/torneos/${t.slug}`,
      dedupeKey: `knockout.result:${m.id}`,
    },
  );
  if (loserId)
    await notifyUsers([loserId], {
      level: "INFO",
      kind: "knockout.result",
      title: `Quedaste afuera en ${name.toLowerCase()} de ${t.name}`,
      body:
        t.thirdPlaceMatch && m.round === rounds - 1
          ? `Perdiste${how}, pero todavía jugás por el tercer puesto.`
          : `Perdiste${how}. ¡Gracias por jugar!`,
      href: `/torneos/${t.slug}`,
      dedupeKey: `knockout.result:${m.id}`,
    });
  return done;
}

// ───────────────────────── Cuestionarios de los partidos ─────────────────────────

/** Elige `n` preguntas según el origen configurado en el torneo (las reutilizadas cuidan el banco). */
function pickForTournament(pools: CategoryPool[], n: number, source: QuestionSource, allowReuse: boolean) {
  if (n <= 0) return { picks: [] as Pick[], missing: 0 };
  if (source === "NEW_FIRST") return pickAcrossCategories(pools, n, { allowReuse });
  const old = pickAcrossCategories(
    pools.map((p) => ({ fresh: [], reusable: p.reusable })),
    n,
    { allowReuse: true },
  );
  if (!old.missing) return old;
  const taken = new Set(old.picks.map((p) => p.id));
  const rest = pickAcrossCategories(
    pools.map((p) => ({ fresh: p.fresh.filter((c) => !taken.has(c.id)), reusable: [] })),
    old.missing,
    { allowReuse: false },
  );
  return { picks: [...old.picks, ...rest.picks], missing: rest.missing };
}

function withoutIds(pools: CategoryPool[], ids: Set<string>): CategoryPool[] {
  return pools.map((p) => ({ fresh: p.fresh.filter((c) => !ids.has(c.id)), reusable: p.reusable.filter((c) => !ids.has(c.id)) }));
}

/**
 * Arma (y publica) el cuestionario de cada partido que ya tiene a sus dos jugadores. Cada partido lleva
 * `uniqueQuestions` preguntas propias y el resto sorteadas (en otro orden) de un pozo común de su ronda,
 * así difieren entre partidos sin gastar tanto banco. Nunca repite preguntas de rondas anteriores del
 * torneo. El origen (nuevas o reutilizadas primero) es `questionSource`. Avisa al staff si no alcanzan.
 */
export async function ensureMatchQuizzes(tournamentId: string, now = new Date(), db: Db = prisma) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: { categories: { select: { categoryId: true } } } });
  const pending = await db.knockoutMatch.findMany({
    where: { tournamentId, quizId: null, winnerId: null, playerAId: { not: null }, playerBId: { not: null } },
    include: { playerA: { select: { username: true, name: true } }, playerB: { select: { username: true, name: true } } },
    orderBy: [{ round: "asc" }, { position: "asc" }],
  });
  if (!pending.length) return 0;
  const s = await getSettings(db);
  const allowReuse = t.questionSource === "REUSED_FIRST" || s["autoquiz.allowReuse"];
  const candidates = await Promise.all(t.categories.map((c) => loadCandidates(c.categoryId, { ...s, "autoquiz.allowReuse": allowReuse }, now, db)));
  // Lo que ya salió en el torneo no se repite, y los pozos de cada ronda tampoco se usan como exclusivas.
  const used = await db.quizQuestion.findMany({ where: { quiz: { tournamentId } }, select: { questionId: true } });
  const roundPools = { ...((t.knockoutPools ?? {}) as Record<string, string[]>) };
  let pools = withoutIds(candidates, new Set([...used.map((u) => u.questionId), ...Object.values(roundPools).flat()]));
  const { exclusive, shared, poolSize } = matchQuestionSplit(t.questionsPerQuiz, t.uniqueQuestions);
  // Para marcar `reused` en las del pozo (que se sortean en varias corridas).
  const reusedIds = new Set(candidates.flatMap((c) => c.reusable.map((r) => r.id)));
  let created = 0;
  let short = 0;
  for (const m of pending) {
    let pool = roundPools[m.round] ?? [];
    if (poolSize && !pool.length) {
      const r = pickForTournament(pools, poolSize, t.questionSource, allowReuse);
      pool = r.picks.map((p) => p.id);
      roundPools[m.round] = pool;
      pools = withoutIds(pools, new Set(pool));
      await db.tournament.update({ where: { id: tournamentId }, data: { knockoutPools: roundPools } });
    }
    const own = pickForTournament(pools, exclusive, t.questionSource, allowReuse);
    pools = withoutIds(pools, new Set(own.picks.map((p) => p.id)));
    const fromPool = sample(pool, shared, () => randomInt(1 << 30) / (1 << 30));
    const picks: Pick[] = [...own.picks, ...fromPool.map((id) => ({ id, reused: reusedIds.has(id) }))];
    if (picks.length < t.questionsPerQuiz) short++;
    const who = (u: { username: string | null; name: string } | null) => (u?.username ? `@${u.username}` : (u?.name ?? "?"));
    const data = {
      title: `${t.name} — ${roundName(m.round, t.quizCount, m.position)}: ${who(m.playerA)} vs ${who(m.playerB)}`,
      tournamentId,
      opensAt: m.opensAt,
      closesAt: m.closesAt,
      expiresAt: new Date(Math.max(t.endsAt.getTime(), m.closesAt.getTime())),
      timeLimitSec: s["quiz.timeLimitSec"],
      shuffleQuestions: true,
      shuffleOptions: true,
      scoring: t.scoring as Prisma.InputJsonValue,
      publishedAt: now,
      questions: { create: picks.map((p, position) => ({ questionId: p.id, position, reused: p.reused })) },
    };
    await db.$transaction(async (tx) => {
      const fresh = await tx.knockoutMatch.findUnique({ where: { id: m.id }, select: { quizId: true } });
      if (fresh?.quizId) return;
      const quiz = await tx.quiz.create({ data: { ...data, status: getQuizStatus({ ...data, publishedAt: now }, now) } });
      await tx.knockoutMatch.update({ where: { id: m.id }, data: { quizId: quiz.id } });
      created++;
    });
  }
  if (short)
    await notifyStaff(
      {
        level: "CRITICAL",
        kind: "tournament.bankShort",
        title: `${t.name}: faltan preguntas para los partidos`,
        body: `${short} partido(s) quedaron con menos de ${t.questionsPerQuiz} preguntas. Cargá preguntas en sus categorías.`,
        href: `/admin/torneos/${t.id}`,
        dedupeKey: `tournament.bankShort:${t.id}:knockout:${pending[0].round}`,
      },
      now,
      db,
    );
  return created;
}

// ───────────────────────── Resultados ─────────────────────────

/**
 * Decide el partido si ya jugaron los dos o si cerró (W.O. para el que no jugó). Antes de decidir por
 * cierre se terminan los intentos colgados. Si era el último partido, cierra el torneo.
 */
export async function settleMatch(matchId: string, now = new Date()) {
  const m = await prisma.knockoutMatch.findUnique({ where: { id: matchId } });
  if (!m || m.winnerId || !m.playerAId || !m.playerBId) return false;
  const closed = now >= m.closesAt;
  let attempts = m.quizId ? await prisma.attempt.findMany({ where: { quizId: m.quizId, userId: { in: [m.playerAId, m.playerBId] } } }) : [];
  const done = attempts.filter((a) => (FINISHED as readonly string[]).includes(a.status));
  if (!closed && done.length < 2) return false;
  if (closed && attempts.some((a) => a.status === "IN_PROGRESS")) {
    for (const a of attempts.filter((x) => x.status === "IN_PROGRESS")) await finalizeAttempt(a.id, now);
    attempts = await prisma.attempt.findMany({ where: { quizId: m.quizId!, userId: { in: [m.playerAId, m.playerBId] } } });
  }
  const side = (userId: string, seed: number | null): MatchSide => {
    const a = attempts.find((x) => x.userId === userId && (FINISHED as readonly string[]).includes(x.status));
    return { userId, seed: seed ?? Number.MAX_SAFE_INTEGER, result: a ? { score: a.score, correctCount: a.correctCount, totalTimeMs: a.totalTimeMs } : null };
  };
  const d = decideMatch(side(m.playerAId, m.seedA), side(m.playerBId, m.seedB));
  if (!(await advance(m, d.winnerId, d.loserId, d.result, now))) return false;
  await ensureMatchQuizzes(m.tournamentId, now);
  await finishTournament(m.tournamentId, now);
  return true;
}

/** Al terminar un intento: si es de un partido y ya jugaron los dos, se decide. */
export async function settleForQuiz(quizId: string, now = new Date()) {
  const m = await prisma.knockoutMatch.findUnique({ where: { quizId }, select: { id: true } });
  if (m) await settleMatch(m.id, now);
}

/** Filas del resultado final de una eliminatoria, o null si todavía no se decidió la final (y el 3er puesto). */
export async function knockoutFinalRows(t: Tournament, db: Db = prisma) {
  const matches = await db.knockoutMatch.findMany({ where: { tournamentId: t.id } });
  if (!matches.length) return null;
  const rounds = t.quizCount;
  if (matches.some((m) => m.round === rounds && !m.winnerId)) return null;
  const ranks = finalRanks(matches, rounds, t.thirdPlaceMatch);
  const quizIds = matches.map((m) => m.quizId).filter((x): x is string => Boolean(x));
  const attempts = await db.attempt.findMany({ where: { quizId: { in: quizIds }, status: { in: [...FINISHED] } } });
  return [...ranks.entries()].map(([userId, rank]) => {
    const mine = attempts.filter((a) => a.userId === userId);
    return {
      userId,
      rank,
      points: mine.reduce((s, a) => s + a.score, 0),
      quizzesPlayed: mine.length,
      quizzesTotal: matches.filter((m) => m.result !== "BYE" && (m.playerAId === userId || m.playerBId === userId)).length,
      correctCount: mine.reduce((s, a) => s + a.correctCount, 0),
    };
  });
}

// ───────────────────────── Worker ─────────────────────────

/** Tarea `knockout`: arma los cuadros al cerrar la inscripción, decide los partidos vencidos y arma cuestionarios. */
export async function runKnockouts(now = new Date()) {
  const toBuild = await prisma.tournament.findMany({
    where: { format: "KNOCKOUT", status: "PUBLISHED", registrationEndsAt: { lte: now }, matches: { none: {} } },
    select: { id: true },
  });
  let built = 0;
  for (const t of toBuild) if (await buildBracket(t.id, now)) built++;

  const due = await prisma.knockoutMatch.findMany({
    where: { winnerId: null, closesAt: { lte: now }, tournament: { status: "PUBLISHED" } },
    orderBy: [{ round: "asc" }, { position: "asc" }],
    select: { id: true },
  });
  let settled = 0;
  for (const m of due) if (await settleMatch(m.id, now)) settled++;

  let quizzes = 0;
  const active = await prisma.tournament.findMany({ where: { format: "KNOCKOUT", status: "PUBLISHED", matches: { some: {} } }, select: { id: true } });
  for (const t of active) {
    quizzes += await ensureMatchQuizzes(t.id, now);
    await finishTournament(t.id, now);
  }
  return { built, settled, quizzes };
}

// ───────────────────────── Lectura ─────────────────────────

/** Cuadro para mostrar: partidos con jugadores; el puntaje de cada lado solo cuando el partido está decidido. */
export async function getBracket(tournamentId: string, db: Db = prisma) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { quizCount: true } });
  const matches = await db.knockoutMatch.findMany({
    where: { tournamentId },
    include: {
      playerA: { select: { id: true, name: true, username: true } },
      playerB: { select: { id: true, name: true, username: true } },
      quiz: { select: { id: true, attempts: { where: { status: { in: [...FINISHED] } }, select: { userId: true, score: true } } } },
    },
    orderBy: [{ round: "asc" }, { position: "asc" }],
  });
  const rounds = t.quizCount;
  return {
    rounds,
    matches: matches.map((m) => {
      const score = (userId: string | null) => (m.winnerId && userId ? (m.quiz?.attempts.find((a) => a.userId === userId)?.score ?? null) : null);
      return {
        id: m.id,
        round: m.round,
        position: m.position,
        name: roundName(m.round, rounds, m.position),
        opensAt: m.opensAt,
        closesAt: m.closesAt,
        quizId: m.quizId,
        winnerId: m.winnerId,
        result: m.result,
        played: m.quiz?.attempts.map((a) => a.userId) ?? [],
        a: m.playerA ? { ...m.playerA, seed: m.seedA, score: score(m.playerA.id) } : null,
        b: m.playerB ? { ...m.playerB, seed: m.seedB, score: score(m.playerB.id) } : null,
      };
    }),
  };
}

export type BracketView = Awaited<ReturnType<typeof getBracket>>;
