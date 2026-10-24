import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { postTransaction, getBalance } from "@/server/credits/service";
import { enrollInTournament } from "@/server/tournaments/service";
import { applyQualifiers } from "@/server/tournaments/knockout";
import { addDays, localDay } from "@/server/seasons/plan";
import { cancelRun, launchSeason, runSeasons, saveRules, saveSeason, saveStage } from "@/server/seasons/service";
import { hasDb, makeCategory, makeUser, resetDb } from "./helpers";

const HOUR = 3_600_000;

function config(categoryIds: string[], over: Record<string, unknown> = {}) {
  return {
    categoryIds,
    quizCount: 1,
    frequencyHours: 24,
    quizActiveHours: 24,
    registrationLeadDays: 0,
    lateEntryDays: 0,
    questionsPerQuiz: 3,
    autoQuizzes: false,
    entryCost: 0,
    maxParticipants: null,
    wildcardsPerQuiz: 0,
    wildcards: [],
    prizes: [],
    scoring: { base: 100, timeBonus: 50, wrongPenalty: 0 },
    format: "POINTS",
    ...over,
  };
}

/** Plantilla: dos torneos por puntos (A y B) → Oro (1–2 de cada uno) y Plata (3–4 de cada uno). */
async function makeSeason(over: { plata?: Record<string, unknown>; repeatAfterDays?: number | null } = {}) {
  const admin = await makeUser("ADMIN");
  const cat = await makeCategory();
  const season = await saveSeason(null, { name: "Temporada Prueba", repeatAfterDays: over.repeatAfterDays ?? null }, admin);
  const meta = (name: string, offsetDays: number) => ({ name, offsetDays, startTime: "20:00" });
  const a = await saveStage(season.id, null, meta("Fecha A", 0), config([cat.id]), admin);
  const b = await saveStage(season.id, null, meta("Fecha B", 0), config([cat.id]), admin);
  const oro = await saveStage(season.id, null, meta("Oro", 3), config([cat.id], { format: "KNOCKOUT", maxParticipants: 4 }), admin);
  const plata = await saveStage(season.id, null, meta("Plata", 3), config([cat.id], { format: "KNOCKOUT", maxParticipants: 4, ...over.plata }), admin);
  await saveRules(
    season.id,
    [
      { sourceStageId: a.id, targetStageId: oro.id, fromRank: 1, toRank: 2 },
      { sourceStageId: b.id, targetStageId: oro.id, fromRank: 1, toRank: 2 },
      { sourceStageId: a.id, targetStageId: plata.id, fromRank: 3, toRank: 4 },
      { sourceStageId: b.id, targetStageId: plata.id, fromRank: 3, toRank: 4 },
    ],
    admin,
  );
  return { admin, season, stages: { a, b, oro, plata } };
}

async function finishWith(tournamentId: string, userIds: string[]) {
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "FINISHED" } });
  await prisma.tournamentResult.createMany({
    data: userIds.map((userId, i) => ({
      tournamentId,
      userId,
      rank: i + 1,
      participants: userIds.length,
      points: 1000 - i,
      quizzesPlayed: 1,
      quizzesTotal: 1,
      correctCount: 3,
      tournamentName: "x",
      finishedAt: new Date(),
    })),
  });
  return applyQualifiers(tournamentId);
}

describe.skipIf(!hasDb)("temporadas", () => {
  beforeEach(resetDb);

  it("lanzar crea los torneos publicados con fechas y clasificatorios por rango; el que sube a Oro deja su lugar en Plata", async () => {
    const { admin, season, stages } = await makeSeason({ plata: { maxParticipants: 8, entryCost: 10 } });
    const day0 = addDays(localDay(new Date()), 1);
    const run = await launchSeason(season.id, day0, admin);
    const ts = await prisma.tournament.findMany({ where: { seasonRunId: run.id }, include: { qualifiers: true } });
    expect(ts).toHaveLength(4);
    expect(ts.every((t) => t.status === "PUBLISHED")).toBe(true);
    const by = (stageId: string) => ts.find((t) => t.seasonStageId === stageId)!;
    const [A, B, oro, plata] = [by(stages.a.id), by(stages.b.id), by(stages.oro.id), by(stages.plata.id)];
    expect(oro.name).toBe("Oro · Temporada Prueba #1");
    expect(oro.startsAt.getTime() - A.startsAt.getTime()).toBe(3 * 24 * HOUR);
    expect(plata.qualifiers.map((q) => [q.sourceTournamentId, q.fromRank, q.topN]).sort()).toEqual(
      [
        [A.id, 3, 4],
        [B.id, 3, 4],
      ].sort(),
    );
    expect(run.endsAt.getTime()).toBe(plata.endsAt.getTime()); // Plata es de 8: una ronda más que Oro

    const u = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => makeUser()));
    // u[5] se anota pagando en Plata (cupo abierto: 8 − 4 reservados).
    await postTransaction({ userId: u[5].id, amount: 50, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: "b5" });
    await enrollInTournament(u[5].id, plata.id);
    expect(await getBalance(u[5].id)).toBe(40);

    // A: 1–2 a Oro, 3–4 a Plata.
    await finishWith(A.id, [u[0], u[1], u[2], u[3], u[4]].map((x) => x.id));
    const entries = async (id: string) => (await prisma.tournamentEntry.findMany({ where: { tournamentId: id } })).map((e) => e.userId).sort();
    expect(await entries(oro.id)).toEqual([u[0].id, u[1].id].sort());
    expect(await entries(plata.id)).toEqual([u[2].id, u[3].id, u[5].id].sort());

    // B: u[2] sale 1º y u[5] 2º → suben a Oro; dejan Plata (u[5] con reintegro) y entra el 5º de A.
    await finishWith(B.id, [u[2], u[5], u[6], u[7]].map((x) => x.id));
    expect(await entries(oro.id)).toEqual([u[0].id, u[1].id, u[2].id, u[5].id].sort());
    expect(await entries(plata.id)).toEqual([u[3].id, u[4].id, u[6].id, u[7].id].sort());
    expect(await getBalance(u[5].id)).toBe(50);
  });

  it("valida antes de lanzar y no deja empezar en el pasado", async () => {
    const { admin, season, stages } = await makeSeason();
    await expect(launchSeason(season.id, addDays(localDay(new Date()), -1), admin)).rejects.toThrow("en el pasado");
    // Un origen que termina después de que cierra la inscripción de la eliminatoria.
    await saveStage(season.id, stages.a.id, { name: "Fecha A", offsetDays: 5, startTime: "20:00" }, config([((await prisma.category.findFirst())!).id]), admin);
    await expect(launchSeason(season.id, addDays(localDay(new Date()), 1), admin)).rejects.toThrow("termina después");
  });

  it("se repite sola N días después del fin, una sola vez; cancelar una instancia reintegra y corta la repetición", async () => {
    const { admin, season } = await makeSeason({ repeatAfterDays: 2 });
    const run1 = await launchSeason(season.id, addDays(localDay(new Date()), 1), admin);
    // Todavía falta: no se lanza.
    expect((await runSeasons(new Date())).launched).toBe(0);
    // Un día antes de que abra la inscripción de la siguiente (anticipación 0 = al empezar).
    const late = new Date(run1.endsAt.getTime() + 36 * HOUR);
    expect((await runSeasons(late)).launched).toBe(1);
    expect((await runSeasons(late)).launched).toBe(0);
    const run2 = await prisma.seasonRun.findFirstOrThrow({ where: { seasonId: season.id, number: 2 } });
    expect(run2.day0).toBe(addDays(localDay(run1.endsAt), 2));

    const cancelled = await cancelRun(run2.id, "prueba", admin, late);
    expect(cancelled).toBe(4);
    expect((await prisma.seasonRun.findUniqueOrThrow({ where: { id: run2.id } })).status).toBe("CANCELLED");
    expect((await runSeasons(new Date(late.getTime() + 30 * 24 * HOUR))).launched).toBe(0);
  });
});
