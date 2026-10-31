import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { setSetting } from "@/server/config/service";
import { finishTournament, publishTournament, saveTournament, stopRepeating } from "@/server/tournaments/service";
import { generateTournamentDrafts, notifyTournamentBank } from "@/server/tournaments/auto";
import { createNextEditions, notifySeriesRegistration } from "@/server/tournaments/series";
import { handleDueDrafts, listPendingDrafts } from "@/server/autoquiz/service";
import { getTournamentStats } from "@/server/player/tournament-stats";
import { getInventory } from "@/server/inventory/service";
import { getBalance } from "@/server/credits/service";
import { toDateTimeInput } from "@/lib/format";
import { hasDb, makeCategory, makeQuestions, makeUser, resetDb } from "./helpers";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BA = "America/Argentina/Buenos_Aires";

function input(categoryIds: string[], over: Record<string, unknown> = {}) {
  return {
    name: "Semanal",
    categoryIds,
    startsAt: new Date(Math.ceil((Date.now() + 2 * HOUR) / 60_000) * 60_000),
    quizCount: 3,
    frequencyHours: 24,
    quizActiveHours: 24,
    registrationLeadDays: 0,
    lateEntryDays: 0,
    questionsPerQuiz: 4,
    autoQuizzes: true,
    repeatEveryDays: null,
    entryCost: 0,
    maxParticipants: null,
    wildcardsPerQuiz: 0,
    wildcards: [],
    prizes: [{ rank: 1, credits: 100 }],
    scoring: { base: 100, timeBonus: 50, wrongPenalty: 0 },
    ...over,
  };
}

describe.skipIf(!hasDb)("torneos automáticos", () => {
  beforeEach(resetDb);

  it("deriva las fechas, arma un borrador por fecha con preguntas de sus categorías y siguen el flujo de la liga", async () => {
    const admin = await makeUser("ADMIN");
    const [c1, c2] = [await makeCategory(), await makeCategory()];
    await makeQuestions(c1.id, 10);
    await makeQuestions(c2.id, 10);
    const t = await saveTournament(null, input([c1.id, c2.id]), admin);
    expect(t.endsAt.getTime() - t.startsAt.getTime()).toBe(3 * DAY); // 3 fechas diarias + 24 h la última
    expect(t.registrationEndsAt).toEqual(t.startsAt);

    expect((await generateTournamentDrafts()).created).toBe(0); // en borrador no se arma nada
    await publishTournament(t.id, admin);
    expect((await generateTournamentDrafts()).created).toBe(3);
    expect((await generateTournamentDrafts()).created).toBe(0);

    const quizzes = await prisma.quiz.findMany({
      where: { tournamentId: t.id },
      include: { questions: { include: { question: { include: { categories: true } } } } },
      orderBy: { opensAt: "asc" },
    });
    expect(quizzes.map((q) => q.questions.length)).toEqual([4, 4, 4]);
    const ids = quizzes.flatMap((q) => q.questions.map((x) => x.questionId));
    expect(new Set(ids).size).toBe(12); // nunca repite
    for (const q of quizzes) {
      const cats = q.questions.map((x) => x.question.categories[0].categoryId);
      expect(cats.filter((c) => c === c1.id)).toHaveLength(2); // repartidas parejo
    }
    expect(quizzes.map((q) => toDateTimeInput(q.opensAt, BA).slice(11))).toEqual(
      Array(3).fill(toDateTimeInput(t.startsAt, BA).slice(11)),
    );

    const pending = await listPendingDrafts();
    expect(pending.filter((d) => d.tournament)).toHaveLength(3);
    expect(pending[0].category.name).toBe("Semanal");

    // Abren en 2 h y 26 h: ya pasó su publicación automática (48 h antes). La de 50 h todavía no.
    expect((await handleDueDrafts()).published).toBe(2);
    expect(
      (await prisma.quiz.findFirstOrThrow({ where: { tournamentId: t.id }, orderBy: { opensAt: "asc" } })).publishedAt,
    ).not.toBeNull();
  });

  it("avisa si el banco de sus categorías no alcanza para las fechas que faltan armar", async () => {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    await makeQuestions(cat.id, 5);
    await setSetting("autoquiz.horizonDays", 1, admin.id);
    const t = await saveTournament(null, input([cat.id], { questionsPerQuiz: 4 }), admin);
    await publishTournament(t.id, admin);
    await generateTournamentDrafts(); // solo la primera (horizonte de 1 día): quedan 1 pregunta y 2 fechas por armar
    expect((await notifyTournamentBank()).sent).toBeGreaterThan(0);
    const [n] = await prisma.notification.findMany({ where: { kind: "tournament.bankShort" } });
    expect(n.level).toBe("CRITICAL");
  });

  it("al terminar guarda resultados permanentes, paga premios y avisa", async () => {
    const cat = await makeCategory();
    const [ana, beto] = [await makeUser(), await makeUser()];
    const now = new Date();
    const t = await prisma.tournament.create({
      data: {
        slug: "copa",
        name: "Copa",
        status: "PUBLISHED",
        startsAt: new Date(now.getTime() - 3 * DAY),
        endsAt: new Date(now.getTime() - HOUR),
        registrationOpensAt: new Date(now.getTime() - 5 * DAY),
        registrationEndsAt: new Date(now.getTime() - 3 * DAY),
        prizes: [
          { rank: 1, credits: 100 },
          { rank: 2, credits: 0, stars: 3 },
        ],
        categories: { create: { categoryId: cat.id } },
        entries: { create: [{ userId: ana.id }, { userId: beto.id }] },
      },
    });
    const quiz = await prisma.quiz.create({
      data: {
        title: "F1",
        tournamentId: t.id,
        publishedAt: new Date(now.getTime() - 4 * DAY),
        opensAt: new Date(now.getTime() - 3 * DAY),
        closesAt: new Date(now.getTime() - 2 * DAY),
        expiresAt: t.endsAt,
      },
    });
    const done = (userId: string, score: number) =>
      prisma.attempt.create({
        data: {
          quizId: quiz.id,
          userId,
          status: "FINISHED",
          score,
          correctCount: score / 100,
          startedAt: quiz.opensAt,
          finishedAt: quiz.opensAt,
          deadlineAt: quiz.closesAt,
        },
      });
    await done(ana.id, 500);
    await done(beto.id, 300);

    expect(await finishTournament(t.id, now)).toBe(true);
    const results = await prisma.tournamentResult.findMany({ where: { tournamentId: t.id }, orderBy: { rank: "asc" } });
    expect(results).toMatchObject([
      {
        userId: ana.id,
        rank: 1,
        participants: 2,
        points: 500,
        prizeCredits: 100,
        quizzesPlayed: 1,
        quizzesTotal: 1,
        tournamentName: "Copa",
      },
      { userId: beto.id, rank: 2, prizeCredits: 0, prizeStars: 3 },
    ]);
    expect(await getInventory(beto.id)).toEqual({ stars: 3, extraLives: 0 });
    expect(await getBalance(beto.id)).toBe(0);
    const notes = await prisma.notification.findMany({ where: { kind: "tournament.finished" }, orderBy: { title: "asc" } });
    expect(notes).toHaveLength(2);
    expect(notes.find((n) => n.userId === ana.id)!.title).toContain("#1 de 2");
    expect(notes.find((n) => n.userId === beto.id)!.body).toBe("Ganaste 3 ⭐ de premio.");
    // Repetir no paga dos veces.
    await prisma.tournament.update({ where: { id: t.id }, data: { status: "PUBLISHED" } });
    await finishTournament(t.id, now);
    expect((await getInventory(beto.id)).stars).toBe(3);

    // Queda aunque cambien las inscripciones o se recalcule la tabla.
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId: t.id } });
    await prisma.tournamentStanding.deleteMany({ where: { tournamentId: t.id } });
    const stats = await getTournamentStats(ana.id);
    expect(stats.summary).toMatchObject({ played: 1, bestRank: 1, prizeCredits: 100, podiums: { first: 1 } });
  });

  it("serie: al empezar crea la próxima edición una sola vez; avisa a los de la anterior; se puede cortar", async () => {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    const ana = await makeUser();
    const startsAt = new Date(Math.floor((Date.now() - HOUR) / 60_000) * 60_000);
    const t = await saveTournament(null, input([cat.id], { startsAt, repeatEveryDays: 7, registrationLeadDays: 3 }), admin);
    await publishTournament(t.id, admin);
    await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId: ana.id } });

    expect((await createNextEditions()).created).toBe(1);
    expect((await createNextEditions()).created).toBe(0);
    const next = await prisma.tournament.findFirstOrThrow({ where: { edition: 2 }, include: { categories: true } });
    expect(next).toMatchObject({
      name: "Semanal #2",
      status: "PUBLISHED",
      seriesId: t.id,
      seriesName: "Semanal",
      repeatEveryDays: 7,
    });
    expect(toDateTimeInput(next.startsAt, BA).slice(11)).toBe(toDateTimeInput(startsAt, BA).slice(11));
    expect(next.startsAt.getTime() - startsAt.getTime()).toBe(7 * DAY);
    expect(next.categories.map((c) => c.categoryId)).toEqual([cat.id]);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).seriesId).toBe(t.id);

    // Abre la inscripción de la #2 (3 días antes): avisa a quienes jugaron la #1.
    expect((await notifySeriesRegistration(new Date(startsAt.getTime() + 5 * DAY))).sent).toBe(1);
    expect((await notifySeriesRegistration(new Date(startsAt.getTime() + 5 * DAY))).sent).toBe(0);

    await stopRepeating(next.id, admin);
    expect((await createNextEditions(new Date(next.startsAt.getTime() + HOUR))).created).toBe(0);
  });
});

describe.skipIf(!hasDb)("torneos automáticos: siempre salen", () => {
  beforeEach(resetDb);

  async function setup(questions: number, over: Record<string, unknown> = {}) {
    const admin = await makeUser("ADMIN");
    const cat = await makeCategory();
    const qs = await makeQuestions(cat.id, questions);
    const t = await saveTournament(null, input([cat.id], { quizCount: 1, ...over }), admin);
    await publishTournament(t.id, admin);
    return { admin, cat, qs, t };
  }

  it("sin preguntas nuevas reutiliza las usadas hace poco (ignora reuseAfterDays)", async () => {
    const { cat, qs, t } = await setup(4);
    // Las 4 se usaron en un cuestionario de liga que cerró ayer.
    await prisma.quiz.create({
      data: {
        title: "Viejo",
        categoryId: cat.id,
        opensAt: new Date(Date.now() - 2 * DAY),
        closesAt: new Date(Date.now() - DAY),
        expiresAt: new Date(Date.now() - DAY),
        publishedAt: new Date(Date.now() - 3 * DAY),
        questions: { create: qs.map((q, position) => ({ questionId: q.id, position })) },
      },
    });
    expect((await generateTournamentDrafts()).created).toBe(1);
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { tournamentId: t.id }, include: { questions: true } });
    expect(quiz.questions).toHaveLength(4);
    expect(quiz.questions.every((q) => q.reused)).toBe(true);
  });

  it("al abrir, un borrador corto se completa con lo que haya y se publica igual", async () => {
    const { t } = await setup(2);
    await generateTournamentDrafts();
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { tournamentId: t.id } });
    const atOpening = new Date(quiz.opensAt.getTime() + 60_000);
    expect((await handleDueDrafts(atOpening)).published).toBe(1);
    const after = await prisma.quiz.findUniqueOrThrow({
      where: { id: quiz.id },
      include: { _count: { select: { questions: true } } },
    });
    expect(after.publishedAt).not.toBeNull();
    expect(after._count.questions).toBe(2);
    expect((await prisma.notification.findFirstOrThrow({ where: { kind: "draft.autoPublished" } })).level).toBe("WARNING");
  });

  it("sin ninguna pregunta al abrir se saltea el turno y avisa CRITICAL", async () => {
    const { t } = await setup(0);
    await generateTournamentDrafts();
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { tournamentId: t.id } });
    expect((await handleDueDrafts(new Date(quiz.opensAt.getTime() + 60_000))).skipped).toBe(1);
    expect(await prisma.quiz.count({ where: { tournamentId: t.id } })).toBe(0);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).skippedSlots).toEqual([quiz.slotAt]);
    expect((await prisma.notification.findFirstOrThrow({ where: { kind: "draft.skipped" } })).level).toBe("CRITICAL");
  });

  it("rescata un turno que ya abrió sin cuestionario y lo publica en el acto", async () => {
    const { t } = await setup(4);
    const later = new Date(t.startsAt.getTime() + 2 * HOUR); // abrió hace 2 h y sigue vigente
    expect((await generateTournamentDrafts(later)).created).toBe(1);
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { tournamentId: t.id } });
    expect(quiz.publishedAt).not.toBeNull();
    expect(quiz.opensAt).toEqual(t.startsAt);
    expect(await prisma.notification.count({ where: { kind: "tournament.slotRescued" } })).toBe(1);
    // Ya cerrado: no se rescata.
    await prisma.quiz.deleteMany({ where: { tournamentId: t.id } });
    expect((await generateTournamentDrafts(new Date(t.endsAt.getTime() + HOUR))).created).toBe(0);
  });
});
