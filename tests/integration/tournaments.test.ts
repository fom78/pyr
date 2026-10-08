import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getBalance, postTransaction } from "@/server/credits/service";
import { cancelTournament, enrollInTournament, finishTournament } from "@/server/tournaments/service";
import { getCurrent, startAttempt, submitAnswer } from "@/server/game/engine";
import { hasDb, makeCategory, makeQuestions, makeUser, resetDb } from "./helpers";

const DAY = 86_400_000;
const now = new Date();
const at = (ms: number) => new Date(now.getTime() + ms);

async function makeTournament(over: Partial<{ entryCost: number; maxParticipants: number | null; endsAt: Date }> = {}) {
  const cat = await makeCategory();
  return prisma.tournament.create({
    data: {
      slug: `t${Date.now()}${Math.random()}`.replace(".", ""),
      name: "Copa Test",
      status: "PUBLISHED",
      startsAt: at(-DAY),
      endsAt: over.endsAt ?? at(10 * DAY),
      registrationOpensAt: at(-DAY),
      registrationEndsAt: at(DAY),
      entryCost: over.entryCost ?? 30,
      maxParticipants: over.maxParticipants ?? null,
      prizes: [
        { rank: 1, credits: 100 },
        { rank: 2, credits: 50 },
      ],
      categories: { create: { categoryId: cat.id } },
      wildcards: { create: [{ type: "DOUBLE_TOTAL", quantity: 1 }] },
    },
    include: { categories: true },
  });
}

async function richUser(credits = 100) {
  const u = await makeUser();
  await postTransaction({ userId: u.id, amount: credits, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: `s:${u.id}` });
  return u;
}

describe.skipIf(!hasDb)("torneos", () => {
  beforeEach(resetDb);

  it("inscribirse cobra el costo una sola vez y no gasta vidas", async () => {
    const t = await makeTournament();
    const u = await richUser();
    await enrollInTournament(u.id, t.id);
    await expect(enrollInTournament(u.id, t.id)).rejects.toThrow(/Ya estás inscripto/);
    expect(await getBalance(u.id)).toBe(70);
    expect(await prisma.categoryMembership.count({ where: { userId: u.id } })).toBe(0);
  });

  it("sin créditos suficientes no se inscribe", async () => {
    const t = await makeTournament({ entryCost: 500 });
    const u = await richUser(100);
    await expect(enrollInTournament(u.id, t.id)).rejects.toThrow(/Saldo insuficiente/);
    expect(await prisma.tournamentEntry.count()).toBe(0);
  });

  it("respeta el cupo aun con inscripciones simultáneas", async () => {
    const t = await makeTournament({ maxParticipants: 2 });
    const users = await Promise.all([1, 2, 3, 4].map(() => richUser()));
    const results = await Promise.allSettled(users.map((u) => enrollInTournament(u.id, t.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await prisma.tournamentEntry.count({ where: { tournamentId: t.id } })).toBe(2);
    // a los rechazados no se les cobró
    const balances = await Promise.all(users.map((u) => getBalance(u.id)));
    expect(balances.filter((b) => b === 100)).toHaveLength(2);
  });

  it("cancelar reembolsa a todos", async () => {
    const t = await makeTournament();
    const admin = await makeUser("ADMIN");
    const u = await richUser();
    await enrollInTournament(u.id, t.id);
    await cancelTournament(t.id, "falta de quórum", admin);
    await cancelTournament(t.id, "x", admin).catch(() => {});
    expect(await getBalance(u.id)).toBe(100);
  });

  it("el comodín se aplica y se gasta; al terminar el torneo se pagan premios", async () => {
    const t = await makeTournament({ endsAt: at(10 * DAY) });
    const qs = await makeQuestions(t.categories[0].categoryId, 2);
    const quiz = await prisma.quiz.create({
      data: {
        title: "Fecha 1",
        tournamentId: t.id,
        publishedAt: at(-DAY),
        opensAt: at(-3600_000),
        closesAt: at(DAY),
        expiresAt: t.endsAt,
        shuffleQuestions: false,
        scoring: { base: 100, timeBonus: 0, wrongPenalty: 0 },
        questions: { create: qs.map((q, i) => ({ questionId: q.id, position: i })) },
      },
    });
    const [a, b] = [await richUser(), await richUser()];
    for (const u of [a, b]) await enrollInTournament(u.id, t.id);

    const play = async (userId: string, wildcard: "DOUBLE_TOTAL" | null) => {
      const att = await startAttempt(userId, quiz.id, { wildcard });
      for (let i = 0; i < 2; i++) {
        const cur = await getCurrent(att.id, userId);
        if (cur.status !== "PLAYING") throw new Error();
        const q = qs.find((x) => x.text === cur.question.text)!;
        await submitAnswer(att.id, userId, { index: i, optionId: q.options.find((o) => o.isCorrect)!.id });
      }
      return prisma.attempt.findUniqueOrThrow({ where: { id: att.id } });
    };
    expect((await play(a.id, "DOUBLE_TOTAL")).score).toBe(400);
    expect((await play(b.id, null)).score).toBe(200);
    // ya no le quedan comodines de ese tipo
    const entry = await prisma.tournamentEntry.findFirstOrThrow({ where: { userId: a.id }, include: { wildcardUses: true } });
    expect(entry.wildcardUses).toHaveLength(1);

    const standings = await prisma.tournamentStanding.findMany({ where: { tournamentId: t.id }, orderBy: { rank: "asc" } });
    expect(standings.map((s) => s.userId)).toEqual([a.id, b.id]);

    expect(await finishTournament(t.id, at(11 * DAY))).toBe(true);
    expect(await finishTournament(t.id, at(12 * DAY))).toBe(false); // idempotente
    expect(await getBalance(a.id)).toBe(70 + 100);
    expect(await getBalance(b.id)).toBe(70 + 50);
  });

  it("no permite usar un comodín más veces de las habilitadas", async () => {
    const t = await makeTournament();
    const qs = await makeQuestions(t.categories[0].categoryId, 1);
    const mk = (title: string) =>
      prisma.quiz.create({
        data: {
          title,
          tournamentId: t.id,
          publishedAt: at(-DAY),
          opensAt: at(-3600_000),
          closesAt: at(DAY),
          expiresAt: t.endsAt,
          questions: { create: [{ questionId: qs[0].id, position: 0 }] },
        },
      });
    const [q1, q2] = [await mk("F1"), await mk("F2")];
    const u = await richUser();
    await enrollInTournament(u.id, t.id);
    await startAttempt(u.id, q1.id, { wildcard: "DOUBLE_TOTAL" });
    await expect(startAttempt(u.id, q2.id, { wildcard: "DOUBLE_TOTAL" })).rejects.toThrow(/no te quedan/);
    // y el intento fallido no quedó creado: puede jugar sin comodín
    await expect(startAttempt(u.id, q2.id, { wildcard: null })).resolves.toBeTruthy();
  });
});
