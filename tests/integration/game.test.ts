import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { finalizeAttempt, getCurrent, startAttempt, submitAnswer, expireStaleAttempts, recalculateQuizAttempts } from "@/server/game/engine";
import { getBalance } from "@/server/credits/service";
import { leagueImpact } from "@/server/ranking/service";
import { hasDb, makeCategory, makeQuestions, makeUser, resetDb } from "./helpers";

const T0 = new Date("2026-05-10T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

async function setup(opts: { count?: number; limitSec?: number; timeMode?: "PER_QUESTION" | "TOTAL" } = {}) {
  const cat = await makeCategory();
  const qs = await makeQuestions(cat.id, opts.count ?? 3);
  const user = await makeUser();
  await prisma.categoryMembership.create({ data: { userId: user.id, categoryId: cat.id } });
  const quiz = await prisma.quiz.create({
    data: {
      title: "Q",
      categoryId: cat.id,
      publishedAt: at(-86_400_000),
      opensAt: at(-3_600_000),
      closesAt: at(86_400_000),
      expiresAt: at(30 * 86_400_000),
      timeLimitSec: opts.limitSec ?? 20,
      timeMode: opts.timeMode ?? "PER_QUESTION",
      shuffleQuestions: false,
      shuffleOptions: true,
      scoring: { base: 100, timeBonus: 50, wrongPenalty: 0 },
      questions: { create: qs.map((q, i) => ({ questionId: q.id, position: i })) },
    },
  });
  const correctOf = (questionText: string | null) => qs.find((q) => q.text === questionText)!.options.find((o) => o.isCorrect)!.id;
  const wrongOf = (questionText: string | null) => qs.find((q) => q.text === questionText)!.options.find((o) => !o.isCorrect)!.id;
  return { cat, qs, user, quiz, correctOf, wrongOf };
}

describe.skipIf(!hasDb)("motor de juego", () => {
  beforeEach(resetDb);

  it("nunca envía cuál es la correcta y mide el tiempo en el servidor", async () => {
    const { user, quiz, correctOf } = await setup();
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    const cur = await getCurrent(a.id, user.id, T0);
    expect(cur.status).toBe("PLAYING");
    if (cur.status !== "PLAYING") return;
    expect(JSON.stringify(cur)).not.toMatch(/isCorrect/i);
    expect(cur.options).toHaveLength(4);
    // responde bien a los 5 s → 100 + 50 × 0.75 = 138 (redondeo de 137.5)
    await submitAnswer(a.id, user.id, { index: 0, optionId: correctOf(cur.question.text) }, at(5000));
    const ans = await prisma.attemptAnswer.findFirstOrThrow({ where: { attemptId: a.id, index: 0 } });
    expect(ans.timeMs).toBe(5000);
    expect(ans.isCorrect).toBe(true);
  });

  it("no se puede reiniciar ni jugar dos veces", async () => {
    const { user, quiz } = await setup();
    await startAttempt(user.id, quiz.id, { now: T0 });
    await expect(startAttempt(user.id, quiz.id, { now: T0 })).rejects.toThrow(/Ya jugaste|Ya empezaste/);
  });

  it("exige estar inscripto en la categoría y que el cuestionario esté vigente", async () => {
    const { quiz } = await setup();
    const outsider = await makeUser();
    await expect(startAttempt(outsider.id, quiz.id, { now: T0 })).rejects.toThrow(/inscripto/);
    const { user, quiz: q2 } = await setup();
    await expect(startAttempt(user.id, q2.id, { now: at(2 * 86_400_000) })).rejects.toThrow(/ya no se puede jugar/);
  });

  it("si cierra la app, la pregunta servida vence y al volver sigue con la próxima", async () => {
    const { user, quiz, correctOf } = await setup();
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    await getCurrent(a.id, user.id, T0); // sirve la 0 y se va
    const back = await getCurrent(a.id, user.id, at(30_000)); // vuelve 30 s después (límite 20 s)
    expect(back.status).toBe("PLAYING");
    if (back.status !== "PLAYING") return;
    expect(back.index).toBe(1);
    const first = await prisma.attemptAnswer.findFirstOrThrow({ where: { attemptId: a.id, index: 0 } });
    expect(first.isCorrect).toBe(false);
    await submitAnswer(a.id, user.id, { index: 1, optionId: correctOf(back.question.text) }, at(31_000));
  });

  it("una respuesta fuera de tiempo cuenta como incorrecta aunque elija la correcta", async () => {
    const { user, quiz, correctOf } = await setup();
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    const cur = await getCurrent(a.id, user.id, T0);
    if (cur.status !== "PLAYING") throw new Error();
    const r = await submitAnswer(a.id, user.id, { index: 0, optionId: correctOf(cur.question.text) }, at(25_000));
    expect(r.accepted).toBe(false);
    expect((await prisma.attemptAnswer.findFirstOrThrow({ where: { attemptId: a.id, index: 0 } })).isCorrect).toBe(false);
  });

  it("rechaza responder una pregunta que ya no está en juego", async () => {
    const { user, quiz, correctOf } = await setup();
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    const cur = await getCurrent(a.id, user.id, T0);
    if (cur.status !== "PLAYING") throw new Error();
    await submitAnswer(a.id, user.id, { index: 0, optionId: correctOf(cur.question.text) }, at(1000));
    await expect(submitAnswer(a.id, user.id, { index: 0, optionId: correctOf(cur.question.text) }, at(1500))).rejects.toThrow(/ya no está en juego/);
  });

  it("al terminar calcula puntaje, aciertos y tiempo, y da créditos", async () => {
    const { user, quiz, correctOf, wrongOf } = await setup();
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    let t = 0;
    for (let i = 0; i < 3; i++) {
      const cur = await getCurrent(a.id, user.id, at(t));
      if (cur.status !== "PLAYING") throw new Error();
      t += 10_000;
      await submitAnswer(a.id, user.id, { index: i, optionId: i < 2 ? correctOf(cur.question.text) : wrongOf(cur.question.text) }, at(t));
    }
    const done = await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(done.status).toBe("FINISHED");
    expect(done.correctCount).toBe(2);
    expect(done.score).toBe(250); // 2 × (100 + 25)
    expect(done.totalTimeMs).toBe(30_000);
    expect(await getBalance(user.id)).toBe(2); // completado (+2); 66% < 80% sin extra
    expect((await getCurrent(a.id, user.id, at(t))).status).toBe("FINISHED");
  });

  it("la tabla de la liga se actualiza al terminar, aunque el cuestionario siga vigente", async () => {
    const { cat, user, quiz, correctOf, wrongOf } = await setup();
    const play = async (userId: string, correct: number) => {
      const a = await startAttempt(userId, quiz.id, { now: T0 });
      for (let i = 0; i < 3; i++) {
        const cur = await getCurrent(a.id, userId, at(i * 1000));
        if (cur.status !== "PLAYING") throw new Error();
        await submitAnswer(a.id, userId, { index: i, optionId: i < correct ? correctOf(cur.question.text) : wrongOf(cur.question.text) }, at(i * 1000));
      }
      return prisma.attempt.findUniqueOrThrow({ where: { id: a.id } });
    };
    // Primer cuestionario de un jugador nuevo: entra a la tabla al instante
    const first = await play(user.id, 1);
    const s1 = await prisma.categoryStanding.findUniqueOrThrow({ where: { categoryId_userId: { categoryId: cat.id, userId: user.id } } });
    expect(s1).toMatchObject({ rank: 1, points: first.score, quizzesCounted: 1 });

    // Otro jugador lo supera: el primero baja al 2.º con tendencia
    const other = await makeUser();
    await prisma.categoryMembership.create({ data: { userId: other.id, categoryId: cat.id } });
    await play(other.id, 3);
    const rows = await prisma.categoryStanding.findMany({ where: { categoryId: cat.id }, orderBy: { rank: "asc" } });
    expect(rows.map((r) => r.userId)).toEqual([other.id, user.id]);
    expect(rows[1].previousRank).toBe(1);

    const impact = await leagueImpact({ id: first.id, userId: user.id }, cat.id, T0);
    expect(impact).toMatchObject({ counts: true, participants: 2 });
    expect(impact?.standing?.rank).toBe(2);
  });

  it("el job cierra intentos abandonados y las no respondidas cuentan como incorrectas", async () => {
    const { user, quiz } = await setup();
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    await getCurrent(a.id, user.id, T0);
    expect(await expireStaleAttempts(at(10 * 60_000))).toBe(1);
    const done = await prisma.attempt.findUniqueOrThrow({ where: { id: a.id }, include: { answers: true } });
    expect(done.status).toBe("TIMED_OUT");
    expect(done.answers).toHaveLength(3);
    expect(done.score).toBe(0);
  });

  it("recalcula si el admin cambia la respuesta correcta o anula una pregunta", async () => {
    const { user, quiz, wrongOf } = await setup({ count: 2 });
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    const chosen: string[] = [];
    for (let i = 0; i < 2; i++) {
      const cur = await getCurrent(a.id, user.id, at(i * 1000));
      if (cur.status !== "PLAYING") throw new Error();
      const opt = wrongOf(cur.question.text);
      chosen.push(opt);
      await submitAnswer(a.id, user.id, { index: i, optionId: opt }, at(i * 1000));
    }
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } })).score).toBe(0);
    // la "incorrecta" elegida en la 1ª pasa a ser la correcta
    const opt = await prisma.questionOption.findUniqueOrThrow({ where: { id: chosen[0] } });
    await prisma.questionOption.updateMany({ where: { questionId: opt.questionId }, data: { isCorrect: false } });
    await prisma.questionOption.update({ where: { id: chosen[0] }, data: { isCorrect: true } });
    await recalculateQuizAttempts(quiz.id);
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.correctCount).toBe(1);
    expect(after.score).toBe(150);
    // anular esa pregunta
    await prisma.quizQuestion.updateMany({ where: { quizId: quiz.id, questionId: opt.questionId }, data: { voided: true } });
    await recalculateQuizAttempts(quiz.id);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } })).score).toBe(0);
  });

  it("modo tiempo total: un único reloj para todo el intento", async () => {
    const { user, quiz } = await setup({ timeMode: "TOTAL", limitSec: 30 });
    const a = await startAttempt(user.id, quiz.id, { now: T0 });
    const cur = await getCurrent(a.id, user.id, T0);
    if (cur.status !== "PLAYING") throw new Error();
    expect(cur.deadlineAt).toBe(at(30_000).toISOString());
    await finalizeAttempt(a.id, at(31_000));
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("TIMED_OUT");
  });
});
