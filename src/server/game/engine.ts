import { randomInt } from "node:crypto";
import { prisma, type Tx } from "@/server/db";
import { Prisma, type WildcardType } from "@/generated/prisma/client";
import { getSettings } from "@/server/config/service";
import { UserError, NotFoundError } from "@/server/errors";
import { getActiveBan } from "@/server/users/bans";
import { isActiveMember } from "@/server/league/service";
import { getQuizStatus } from "@/server/quiz/status";
import { readScoring, scoreAttempt } from "@/server/scoring/attempt";
import { getStrategy, type WildcardAnnouncement, type WildcardState } from "@/server/wildcards/strategies";
import { grantLeagueRewards } from "@/server/credits/rewards";
import { recomputeCategoryStandings, recomputeTournamentStandings } from "@/server/ranking/service";
import { fileUrl } from "@/server/storage";
import { logger } from "@/server/logger";

/**
 * Motor de juego. Reglas antitrampa:
 *  - La respuesta correcta nunca sale del servidor antes de que el intento termine.
 *  - Todos los tiempos se miden en el servidor (servedAt / answeredAt). El cliente solo dibuja el reloj.
 *  - Cerrar o recargar no pausa nada: cada pregunta servida vence a su hora y el intento tiene un límite global.
 *  - Un intento por usuario y cuestionario (unique en DB). No se puede reiniciar.
 */

const DEFAULT_SCORING = { base: 100, timeBonus: 50, wrongPenalty: 0 };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tiempo de referencia por pregunta (para el bonus y para preguntas sin responder). */
function perQuestionLimitMs(quiz: { timeMode: string; timeLimitSec: number }, count: number) {
  return quiz.timeMode === "PER_QUESTION" ? quiz.timeLimitSec * 1000 : Math.round((quiz.timeLimitSec * 1000) / Math.max(1, count));
}

// ───────────────────────── Inicio ─────────────────────────

export type StartOptions = { wildcard?: WildcardType | null; now?: Date };

/** Verifica si el usuario puede jugar el cuestionario (sin crear nada). Devuelve el motivo si no. */
export async function checkCanPlay(userId: string, quizId: string, now = new Date()) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { _count: { select: { questions: { where: { voided: false } } } } },
  });
  if (!quiz) return { ok: false as const, reason: "Cuestionario no encontrado." };
  const status = getQuizStatus(quiz, now);
  if (status !== "ACTIVE")
    return { ok: false as const, reason: status === "SCHEDULED" ? "Este cuestionario todavía no abrió." : "Este cuestionario ya no se puede jugar." };
  if (await getActiveBan(userId, now)) return { ok: false as const, reason: "Tu cuenta está suspendida." };
  const existing = await prisma.attempt.findUnique({ where: { quizId_userId: { quizId, userId } }, select: { id: true, status: true } });
  if (existing) return { ok: false as const, reason: "Ya jugaste este cuestionario.", attemptId: existing.id, attemptStatus: existing.status };
  if (quiz.tournamentId) {
    const entry = await prisma.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId: quiz.tournamentId, userId } } });
    if (!entry) return { ok: false as const, reason: "Tenés que estar inscripto en el torneo." };
  } else if (quiz.categoryId) {
    if (!(await isActiveMember(userId, quiz.categoryId, now)))
      return { ok: false as const, reason: "Tenés que estar inscripto en la categoría para jugar." };
  }
  if (quiz._count.questions === 0) return { ok: false as const, reason: "El cuestionario no tiene preguntas." };
  return { ok: true as const, quiz };
}

/** Comodines que le quedan a un participante en un torneo. */
export async function remainingWildcards(tournamentId: string, userId: string) {
  const [defs, entry] = await Promise.all([
    prisma.tournamentWildcard.findMany({ where: { tournamentId } }),
    prisma.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId, userId } }, include: { wildcardUses: true } }),
  ]);
  return defs.map((d) => ({
    type: d.type,
    total: d.quantity,
    remaining: Math.max(0, d.quantity - (entry?.wildcardUses.filter((u) => u.type === d.type).length ?? 0)),
  }));
}

export async function startAttempt(userId: string, quizId: string, opts: StartOptions = {}) {
  const now = opts.now ?? new Date();
  const check = await checkCanPlay(userId, quizId, now);
  if (!check.ok) throw new UserError(check.reason, "CANNOT_PLAY", 409);
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: quizId },
    include: { questions: { where: { voided: false }, orderBy: { position: "asc" } }, tournament: true },
  });
  const s = await getSettings();
  const ids = quiz.questions.map((q) => q.id);
  const order = quiz.shuffleQuestions ? shuffle(ids) : ids;
  const deadlineAt =
    quiz.timeMode === "PER_QUESTION"
      ? new Date(now.getTime() + order.length * quiz.timeLimitSec * 1000 + s["game.attemptGraceSec"] * 1000)
      : new Date(now.getTime() + quiz.timeLimitSec * 1000);

  try {
    return await prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.create({
        data: { quizId, userId, questionOrder: order, startedAt: now, deadlineAt },
      });
      if (opts.wildcard) {
        if (!quiz.tournament) throw new UserError("Los comodines solo se usan en torneos.");
        if (quiz.tournament.wildcardsPerQuiz < 1) throw new UserError("Este torneo no permite comodines.");
        const entry = await tx.tournamentEntry.findUniqueOrThrow({
          where: { tournamentId_userId: { tournamentId: quiz.tournament.id, userId } },
          include: { wildcardUses: true },
        });
        const def = await tx.tournamentWildcard.findUnique({
          where: { tournamentId_type: { tournamentId: quiz.tournament.id, type: opts.wildcard } },
        });
        const used = entry.wildcardUses.filter((u) => u.type === opts.wildcard).length;
        if (!def || used >= def.quantity) throw new UserError("Ya no te quedan comodines de ese tipo.");
        const state = getStrategy(opts.wildcard).init({ questionCount: order.length, randomInt: (n) => randomInt(n) });
        await tx.wildcardUse.create({ data: { entryId: entry.id, attemptId: attempt.id, type: opts.wildcard, state: state as Prisma.InputJsonValue } });
      }
      return attempt;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      throw new UserError("Ya empezaste este cuestionario.", "ALREADY_STARTED", 409);
    throw err;
  }
}

// ───────────────────────── Pregunta actual ─────────────────────────

export type CurrentQuestion = {
  status: "PLAYING";
  attemptId: string;
  index: number;
  total: number;
  serverNow: string;
  deadlineAt: string; // de esta pregunta
  attemptDeadlineAt: string;
  limitMs: number;
  question: { type: string; text: string | null; imageUrl: string | null };
  options: { id: string; text: string | null; imageUrl: string | null }[];
  /** Aviso del comodín para esta pregunta (ej. triple sorpresa). */
  announce: WildcardAnnouncement | null;
};

export type AttemptState = CurrentQuestion | { status: "FINISHED"; attemptId: string };

async function loadAttempt(attemptId: string, userId: string) {
  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId }, include: { quiz: true, wildcardUse: true } });
  if (!attempt || attempt.userId !== userId) throw new NotFoundError("Intento");
  return attempt;
}

/**
 * Devuelve la pregunta en curso (la sirve si todavía no se sirvió). Avanza sobre las que vencieron
 * mientras el usuario no estaba. Nunca incluye cuál es la correcta.
 */
export async function getCurrent(attemptId: string, userId: string, now = new Date()): Promise<AttemptState> {
  const s = await getSettings();
  const grace = s["game.latencyGraceMs"];
  for (let guard = 0; guard < 200; guard++) {
    const attempt = await loadAttempt(attemptId, userId);
    if (attempt.status !== "IN_PROGRESS") return { status: "FINISHED", attemptId };
    const total = attempt.questionOrder.length;
    if (attempt.currentIndex >= total || now.getTime() > attempt.deadlineAt.getTime() + grace) {
      await finalizeAttempt(attemptId, now);
      return { status: "FINISHED", attemptId };
    }
    const limitMs = perQuestionLimitMs(attempt.quiz, total);
    const index = attempt.currentIndex;
    let answer = await prisma.attemptAnswer.findUnique({ where: { attemptId_index: { attemptId, index } } });

    if (answer && !answer.answeredAt && now.getTime() > answer.deadlineAt.getTime() + grace) {
      // Venció mientras no estaba: cuenta como incorrecta y pasa a la siguiente.
      await prisma.$transaction([
        prisma.attemptAnswer.update({ where: { id: answer.id }, data: { isCorrect: false, timeMs: limitMs } }),
        prisma.attempt.updateMany({ where: { id: attemptId, currentIndex: index }, data: { currentIndex: index + 1 } }),
      ]);
      continue;
    }

    if (!answer) {
      const qqId = attempt.questionOrder[index];
      const qq = await prisma.quizQuestion.findUniqueOrThrow({
        where: { id: qqId },
        include: { question: { include: { options: { orderBy: { position: "asc" } } } } },
      });
      const shuffleOpts = qq.shuffleOptions ?? qq.question.shuffleOptions ?? attempt.quiz.shuffleOptions;
      const optionIds = qq.question.options.map((o) => o.id);
      const deadlineAt =
        attempt.quiz.timeMode === "PER_QUESTION"
          ? new Date(Math.min(now.getTime() + limitMs, attempt.deadlineAt.getTime()))
          : attempt.deadlineAt;
      try {
        answer = await prisma.attemptAnswer.create({
          data: {
            attemptId,
            quizQuestionId: qqId,
            index,
            optionOrder: shuffleOpts ? shuffle(optionIds) : optionIds,
            servedAt: now,
            deadlineAt,
          },
        });
      } catch (err) {
        // Otra pestaña la sirvió al mismo tiempo: releer.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }

    if (answer.answeredAt) {
      // Ya respondida (respuesta llegó pero el índice no avanzó por una carrera): avanzar.
      await prisma.attempt.updateMany({ where: { id: attemptId, currentIndex: index }, data: { currentIndex: index + 1 } });
      continue;
    }

    const qq = await prisma.quizQuestion.findUniqueOrThrow({
      where: { id: answer.quizQuestionId },
      include: { question: { include: { options: true } } },
    });
    const byId = new Map(qq.question.options.map((o) => [o.id, o]));
    return {
      status: "PLAYING",
      attemptId,
      index,
      total,
      serverNow: now.toISOString(),
      deadlineAt: answer.deadlineAt.toISOString(),
      attemptDeadlineAt: attempt.deadlineAt.toISOString(),
      limitMs: answer.deadlineAt.getTime() - answer.servedAt.getTime(),
      question: { type: qq.question.type, text: qq.question.text, imageUrl: fileUrl(qq.question.imageKey) },
      // Solo id, texto e imagen: jamás isCorrect.
      options: answer.optionOrder.map((id) => {
        const o = byId.get(id)!;
        return { id: o.id, text: o.text, imageUrl: fileUrl(o.imageKey) };
      }),
      announce: attempt.wildcardUse
        ? (getStrategy(attempt.wildcardUse.type).announce?.(index, attempt.wildcardUse.state as WildcardState) ?? null)
        : null,
    };
  }
  throw new Error("getCurrent: demasiadas iteraciones");
}

// ───────────────────────── Responder ─────────────────────────

export async function submitAnswer(
  attemptId: string,
  userId: string,
  input: { index: number; optionId: string | null },
  now = new Date(),
) {
  const s = await getSettings();
  const attempt = await loadAttempt(attemptId, userId);
  if (attempt.status !== "IN_PROGRESS") return { accepted: false, finished: true };
  if (input.index !== attempt.currentIndex) throw new UserError("Esa pregunta ya no está en juego.", "STALE", 409);
  const answer = await prisma.attemptAnswer.findUnique({ where: { attemptId_index: { attemptId, index: input.index } } });
  if (!answer || answer.answeredAt) throw new UserError("Esa pregunta ya fue respondida.", "STALE", 409);
  if (input.optionId && !answer.optionOrder.includes(input.optionId)) throw new UserError("Opción inválida.");

  const total = attempt.questionOrder.length;
  const limitMs = perQuestionLimitMs(attempt.quiz, total);
  const late = now.getTime() > answer.deadlineAt.getTime() + s["game.latencyGraceMs"];
  const selected = late ? null : input.optionId;
  const option = selected ? await prisma.questionOption.findUnique({ where: { id: selected } }) : null;
  const elapsed = Math.max(0, now.getTime() - answer.servedAt.getTime());

  // Escrituras condicionales: si llegan dos respuestas a la vez, solo una gana.
  const won = await prisma.$transaction(async (tx) => {
    const upd = await tx.attemptAnswer.updateMany({
      where: { id: answer.id, answeredAt: null },
      data: {
        answeredAt: now,
        selectedOptionId: selected,
        isCorrect: Boolean(option?.isCorrect),
        timeMs: selected ? Math.min(elapsed, limitMs) : limitMs,
      },
    });
    if (upd.count === 0) return false;
    await tx.attempt.updateMany({ where: { id: attemptId, currentIndex: input.index }, data: { currentIndex: input.index + 1 } });
    return true;
  });
  if (!won) throw new UserError("Esa pregunta ya fue respondida.", "STALE", 409);

  const finished = input.index + 1 >= total;
  if (finished) await finalizeAttempt(attemptId, now);
  return { accepted: !late, finished };
}

// ───────────────────────── Cierre y puntaje ─────────────────────────

async function rescoreInTx(tx: Tx, attemptId: string) {
  const attempt = await tx.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { quiz: true, answers: { include: { quizQuestion: true } }, wildcardUse: true },
  });
  const total = attempt.questionOrder.length;
  const limitMs = perQuestionLimitMs(attempt.quiz, total);
  const scoring = readScoring(attempt.quiz.scoring, DEFAULT_SCORING);
  const wildcard = attempt.wildcardUse
    ? { strategy: getStrategy(attempt.wildcardUse.type), state: attempt.wildcardUse.state as Record<string, unknown> }
    : undefined;
  const result = scoreAttempt(
    attempt.answers.map((a) => ({ index: a.index, isCorrect: a.isCorrect, timeMs: a.timeMs, voided: a.quizQuestion.voided })),
    limitMs,
    scoring,
    wildcard,
  );
  for (const a of result.answers) {
    const row = attempt.answers.find((x) => x.index === a.index)!;
    await tx.attemptAnswer.update({
      where: { id: row.id },
      data: { basePoints: a.basePoints, bonusPoints: a.bonusPoints, points: a.points },
    });
  }
  await tx.attempt.update({
    where: { id: attemptId },
    data: { score: result.score, correctCount: result.correctCount, totalTimeMs: result.totalTimeMs },
  });
  return result;
}

/**
 * Cierra el intento: las preguntas no respondidas (o nunca servidas) cuentan como incorrectas,
 * calcula el puntaje con el comodín y otorga recompensas. Idempotente.
 */
export async function finalizeAttempt(attemptId: string, now = new Date()) {
  const done = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "Attempt" WHERE id = ${attemptId} FOR UPDATE`;
    if (!rows.length || rows[0].status !== "IN_PROGRESS") return null;
    const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { quiz: true, answers: true } });
    const total = attempt.questionOrder.length;
    const limitMs = perQuestionLimitMs(attempt.quiz, total);
    let unanswered = 0;
    for (const a of attempt.answers)
      if (!a.answeredAt) {
        unanswered++;
        await tx.attemptAnswer.update({ where: { id: a.id }, data: { isCorrect: false, timeMs: limitMs } });
      }
    const served = new Set(attempt.answers.map((a) => a.index));
    for (let index = 0; index < total; index++) {
      if (served.has(index)) continue;
      unanswered++;
      await tx.attemptAnswer.create({
        data: {
          attemptId,
          quizQuestionId: attempt.questionOrder[index],
          index,
          optionOrder: [],
          servedAt: now,
          deadlineAt: now,
          isCorrect: false,
          timeMs: limitMs,
        },
      });
    }
    await tx.attempt.update({
      where: { id: attemptId },
      data: { status: unanswered > 0 && now >= attempt.deadlineAt ? "TIMED_OUT" : "FINISHED", finishedAt: now, currentIndex: total },
    });
    const result = await rescoreInTx(tx, attemptId);
    return { attempt, result, total };
  });
  if (!done) return;

  // Fuera de la transacción: recompensas y tablas en vivo (no deben bloquear el cierre).
  const { attempt, result, total } = done;
  try {
    if (attempt.quiz.categoryId && !attempt.quiz.tournamentId) {
      await grantLeagueRewards(
        { id: attemptId, userId: attempt.userId, correctCount: result.correctCount },
        { id: attempt.quiz.id, title: attempt.quiz.title, categoryId: attempt.quiz.categoryId, opensAt: attempt.quiz.opensAt },
        total,
      );
      await prisma.attempt.update({ where: { id: attemptId }, data: { rewardsGiven: true } });
    }
  } catch (err) {
    logger.error({ err, attemptId }, "error al otorgar recompensas del intento");
  }
  try {
    // La tabla se actualiza al instante (liga y torneo)
    if (attempt.quiz.tournamentId) await recomputeTournamentStandings(attempt.quiz.tournamentId, now);
    else if (attempt.quiz.categoryId) await recomputeCategoryStandings(attempt.quiz.categoryId, now);
  } catch (err) {
    logger.error({ err, attemptId }, "error al recalcular la tabla tras el intento");
  }
}

/** Recalcula todos los intentos terminados de un cuestionario (cambio de respuesta correcta o pregunta anulada). */
export async function recalculateQuizAttempts(quizId: string) {
  const attempts = await prisma.attempt.findMany({ where: { quizId, status: { in: ["FINISHED", "TIMED_OUT"] } }, select: { id: true } });
  for (const { id } of attempts) {
    await prisma.$transaction(async (tx) => {
      const answers = await tx.attemptAnswer.findMany({ where: { attemptId: id } });
      const optionIds = answers.map((a) => a.selectedOptionId).filter((x): x is string => Boolean(x));
      const correct = new Set(
        (await tx.questionOption.findMany({ where: { id: { in: optionIds }, isCorrect: true }, select: { id: true } })).map((o) => o.id),
      );
      for (const a of answers) {
        const isCorrect = Boolean(a.selectedOptionId && correct.has(a.selectedOptionId));
        if (isCorrect !== a.isCorrect) await tx.attemptAnswer.update({ where: { id: a.id }, data: { isCorrect } });
      }
      await rescoreInTx(tx, id);
    });
  }
  return attempts.length;
}

/** Job: cierra intentos cuyo límite global pasó (usuario que abandonó). */
export async function expireStaleAttempts(now = new Date()) {
  const s = await getSettings();
  const stale = await prisma.attempt.findMany({
    where: { status: "IN_PROGRESS", deadlineAt: { lt: new Date(now.getTime() - s["game.latencyGraceMs"]) } },
    select: { id: true },
    take: 500,
  });
  for (const a of stale) await finalizeAttempt(a.id, now);
  return stale.length;
}
