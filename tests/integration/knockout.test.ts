import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { checkCanPlay, getCurrent, startAttempt, submitAnswer } from "@/server/game/engine";
import { getAttemptResult } from "@/server/game/results";
import { enrollInTournament, publishTournament, saveTournament } from "@/server/tournaments/service";
import { applyQualifiers, buildBracket, confirmQualification, ensureMatchQuizzes, knockoutCapacity, runKnockouts } from "@/server/tournaments/knockout";
import { getBalance } from "@/server/credits/service";
import { hasDb, makeCategory, makeQuestions, makeUser, resetDb } from "./helpers";

const HOUR = 3_600_000;
const MIN = 60_000;

function input(categoryIds: string[], over: Record<string, unknown> = {}) {
  return {
    name: "Copa",
    categoryIds,
    startsAt: new Date(Math.ceil((Date.now() + 2 * HOUR) / MIN) * MIN),
    quizCount: 1,
    frequencyHours: 24,
    quizActiveHours: 24,
    registrationLeadDays: 0,
    lateEntryDays: 0,
    questionsPerQuiz: 3,
    autoQuizzes: false,
    repeatEveryDays: null,
    entryCost: 0,
    maxParticipants: 4,
    wildcardsPerQuiz: 0,
    wildcards: [],
    prizes: [{ rank: 1, credits: 100 }],
    scoring: { base: 100, timeBonus: 50, wrongPenalty: 0 },
    format: "KNOCKOUT",
    ...over,
  };
}

/** Juega un intento completo respondiendo bien las primeras `correct` preguntas. */
async function play(userId: string, quizId: string, correct: number, now: Date) {
  const a = await startAttempt(userId, quizId, { now });
  for (let i = 0; ; i++) {
    const cur = await getCurrent(a.id, userId, now);
    if (cur.status !== "PLAYING") break;
    const options = await prisma.questionOption.findMany({ where: { id: { in: cur.options.map((o) => o.id) } } });
    const pick = options.find((o) => o.isCorrect === i < correct)!;
    await submitAnswer(a.id, userId, { index: cur.index, optionId: pick.id }, now);
  }
  return a;
}

describe.skipIf(!hasDb)("eliminatorias", () => {
  beforeEach(resetDb);

  it("clasificados con lugar reservado, cuadro con pase libre, resultado oculto hasta que juegan los dos y W.O. en la final", async () => {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    await makeQuestions(cat.id, 12);
    const [q1, q2, open1, open2, outsider] = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser()));

    // Torneo de origen (por puntos), ya terminado antes de la eliminatoria.
    const source = await saveTournament(
      null,
      input([cat.id], { name: "Liga de otoño", format: "POINTS", startsAt: new Date(Date.now() - 5 * 24 * HOUR), maxParticipants: null }),
      admin,
    );
    const ko = await saveTournament(null, input([cat.id], { qualifiers: [{ sourceTournamentId: source.id, topN: 2 }] }), admin);
    expect(ko.quizCount).toBe(2); // cuadro de 4 = 2 rondas
    await publishTournament(ko.id, admin);

    // Inscripción abierta: 4 − 2 reservados = 2 lugares.
    await enrollInTournament(open1.id, ko.id);
    await enrollInTournament(open2.id, ko.id);
    await expect(enrollInTournament(outsider.id, ko.id)).rejects.toThrow("reservados para clasificados");
    expect(await knockoutCapacity(ko.id)).toMatchObject({ entries: 2, reserved: 2, open: 0 });

    // Termina el origen: open1 ya estaba inscripto (su lugar pasa al siguiente: q2).
    await prisma.tournament.update({ where: { id: source.id }, data: { status: "FINISHED" } });
    const result = (userId: string, rank: number) => ({
      tournamentId: source.id,
      userId,
      rank,
      participants: 10,
      points: 1000 - rank,
      quizzesPlayed: 3,
      quizzesTotal: 3,
      correctCount: 5,
      tournamentName: "Liga de otoño",
      finishedAt: new Date(),
    });
    await prisma.tournamentResult.createMany({ data: [result(q1.id, 1), result(open1.id, 2), result(q2.id, 3)] });
    await prisma.tournament.update({ where: { id: ko.id }, data: { autoConfirmQualified: false } });
    expect(await applyQualifiers(source.id)).toBe(2);
    const pendingQ2 = await prisma.tournamentEntry.findUniqueOrThrow({ where: { tournamentId_userId: { tournamentId: ko.id, userId: q2.id } } });
    expect(pendingQ2).toMatchObject({ qualifiedRank: 3, confirmedAt: null });
    await confirmQualification(q1.id, ko.id);
    expect((await prisma.tournamentEntry.findUniqueOrThrow({ where: { tournamentId_userId: { tournamentId: ko.id, userId: open1.id } } })).qualifiedRank).toBe(2);

    // Cierra la inscripción: q2 no confirmó y pierde el lugar → 3 jugadores en un cuadro de 4.
    const start = new Date(ko.startsAt.getTime() + MIN);
    expect(await buildBracket(ko.id, start, () => 0.5)).toBe(true);
    expect(await prisma.tournamentEntry.count({ where: { tournamentId: ko.id } })).toBe(3);
    const r1 = await prisma.knockoutMatch.findMany({ where: { tournamentId: ko.id, round: 1 }, orderBy: { position: "asc" } });
    // Siembra: q1 (1°), open1 (2°), open2 (inscripción abierta). El 1 tiene pase libre.
    expect(r1[0]).toMatchObject({ playerAId: q1.id, playerBId: null, result: "BYE", winnerId: q1.id });
    expect(r1[1]).toMatchObject({ playerAId: open1.id, playerBId: open2.id, winnerId: null });
    expect(r1[1].quizId).toBeTruthy();
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: r1[1].quizId! }, include: { _count: { select: { questions: true } } } });
    expect(quiz._count.questions).toBe(3);

    // Solo los dos del partido lo pueden jugar.
    expect(await checkCanPlay(q1.id, quiz.id, start)).toMatchObject({ ok: false, reason: "Este partido es de otros jugadores." });

    const playAt = new Date(start.getTime() + MIN);
    const a1 = await play(open1.id, quiz.id, 1, playAt);
    const hidden = await getAttemptResult(a1.id, open1.id, playAt);
    expect(hidden?.match).toMatchObject({ decided: false, opponentScore: null });
    expect(await prisma.tournamentStanding.count({ where: { tournamentId: ko.id } })).toBe(0);

    await play(open2.id, quiz.id, 3, playAt);
    const shown = await getAttemptResult(a1.id, open1.id, playAt);
    expect(shown?.match).toMatchObject({ decided: true, won: false, result: "PLAYED" });
    expect(shown?.match?.opponentScore).toBeGreaterThan(a1.score);

    // Final: q1 contra open2, con su propio cuestionario (preguntas distintas).
    const final = await prisma.knockoutMatch.findUniqueOrThrow({ where: { tournamentId_round_position: { tournamentId: ko.id, round: 2, position: 0 } } });
    expect(final).toMatchObject({ playerAId: q1.id, playerBId: open2.id });
    const finalQs = await prisma.quizQuestion.findMany({ where: { quizId: final.quizId! } });
    const firstQs = await prisma.quizQuestion.findMany({ where: { quizId: quiz.id } });
    expect(finalQs.some((q) => firstQs.some((f) => f.questionId === q.questionId))).toBe(false);

    // Nadie juega la final: al cierre pasa el mejor sembrado por W.O. y el torneo termina.
    await runKnockouts(new Date(final.closesAt.getTime() + MIN));
    expect(await prisma.knockoutMatch.findUniqueOrThrow({ where: { id: final.id } })).toMatchObject({ winnerId: q1.id, result: "WALKOVER" });
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: ko.id } })).status).toBe("FINISHED");
    const results = await prisma.tournamentResult.findMany({ where: { tournamentId: ko.id }, orderBy: { rank: "asc" } });
    expect(results.map((r) => [r.userId, r.rank])).toEqual([
      [q1.id, 1],
      [open2.id, 2],
      [open1.id, 3],
    ]);
    expect(await getBalance(q1.id)).toBe(100);
  });

  it("con menos de 2 inscriptos se cancela", async () => {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    const u = await makeUser();
    const ko = await saveTournament(null, input([cat.id]), admin);
    await publishTournament(ko.id, admin);
    await enrollInTournament(u.id, ko.id);
    await runKnockouts(new Date(ko.startsAt.getTime() + MIN));
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: ko.id } })).status).toBe("CANCELLED");
  });

  it("valida el tamaño del cuadro y los clasificatorios", async () => {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    await expect(saveTournament(null, input([cat.id], { maxParticipants: 10 }), admin)).rejects.toThrow();
    const late = await saveTournament(null, input([cat.id], { name: "Larga", format: "POINTS", maxParticipants: null, quizCount: 30 }), admin);
    await expect(saveTournament(null, input([cat.id], { qualifiers: [{ sourceTournamentId: late.id, topN: 2 }] }), admin)).rejects.toThrow(
      "termina después",
    );
  });

  it("partidos con preguntas propias y un pozo común; reutilizadas primero", async () => {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    const qs = await makeQuestions(cat.id, 30);
    // 10 preguntas usadas hace un año: son las "reutilizadas".
    const old = qs.slice(0, 10).map((q) => q.id);
    await prisma.quiz.create({
      data: {
        title: "Viejo",
        categoryId: cat.id,
        opensAt: new Date(Date.now() - 400 * 24 * HOUR),
        closesAt: new Date(Date.now() - 399 * 24 * HOUR),
        expiresAt: new Date(Date.now() - 390 * 24 * HOUR),
        publishedAt: new Date(Date.now() - 400 * 24 * HOUR),
        questions: { create: old.map((questionId, position) => ({ questionId, position })) },
      },
    });
    const ko = await saveTournament(
      null,
      input([cat.id], { maxParticipants: 8, questionsPerQuiz: 4, uniqueQuestions: 2, questionSource: "REUSED_FIRST" }),
      admin,
    );
    await publishTournament(ko.id, admin);
    for (const u of await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => makeUser()))) await enrollInTournament(u.id, ko.id);
    await buildBracket(ko.id, new Date(ko.startsAt.getTime() + MIN));

    const matches = await prisma.knockoutMatch.findMany({
      where: { tournamentId: ko.id, round: 1 },
      include: { quiz: { include: { questions: true } } },
    });
    expect(matches).toHaveLength(4);
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: ko.id } });
    const pool = (t.knockoutPools as Record<string, string[]>)["1"];
    expect(pool).toHaveLength(4);
    const sets = matches.map((m) => m.quiz!.questions.map((q) => q.questionId));
    for (const ids of sets) {
      expect(ids).toHaveLength(4);
      expect(ids.filter((id) => pool.includes(id))).toHaveLength(2);
    }
    // Las propias no se repiten entre partidos.
    const own = sets.flatMap((ids) => ids.filter((id) => !pool.includes(id)));
    expect(new Set(own).size).toBe(8);
    // Reutilizadas primero: el pozo (4) y 6 de las propias salen de las 10 viejas.
    const all = new Set([...pool, ...own]);
    expect([...all].filter((id) => old.includes(id))).toHaveLength(10);
  });
  it("sin preguntas nuevas ni viejas usa recientes, y completa un partido corto que nadie empezó", async () => {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    const qs = await makeQuestions(cat.id, 8);
    // Todas usadas en un cuestionario que cerró ayer: ni "nuevas" ni "usadas hace más de reuseAfterDays".
    await prisma.quiz.create({
      data: {
        title: "Reciente",
        categoryId: cat.id,
        opensAt: new Date(Date.now() - 3 * 24 * HOUR),
        closesAt: new Date(Date.now() - 24 * HOUR),
        expiresAt: new Date(Date.now() - 12 * HOUR),
        publishedAt: new Date(Date.now() - 3 * 24 * HOUR),
        questions: { create: qs.map((q, position) => ({ questionId: q.id, position })) },
      },
    });
    const ko = await saveTournament(null, input([cat.id], { questionsPerQuiz: 3, uniqueQuestions: 2, questionSource: "REUSED_FIRST" }), admin);
    await publishTournament(ko.id, admin);
    for (const u of await Promise.all([1, 2].map(() => makeUser()))) await enrollInTournament(u.id, ko.id);
    const start = new Date(ko.startsAt.getTime() + MIN);
    await buildBracket(ko.id, start);
    const match = await prisma.knockoutMatch.findFirstOrThrow({ where: { tournamentId: ko.id, round: 1, quizId: { not: null } } });
    expect(await prisma.quizQuestion.count({ where: { quizId: match.quizId! } })).toBe(3);

    // Quedó corto (p. ej. banco vacío en su momento): el worker lo completa mientras nadie haya empezado.
    await prisma.quizQuestion.deleteMany({ where: { quizId: match.quizId! } });
    await ensureMatchQuizzes(ko.id, start);
    expect(await prisma.quizQuestion.count({ where: { quizId: match.quizId! } })).toBe(3);
  });
});
