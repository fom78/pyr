import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { markRead, notifyStaff, notifyUsers, openNotification, unreadCount } from "@/server/notifications/service";
import { notifyReviewReady } from "@/server/quiz/review-notify";
import { notifyQuizOpened, notifyStreakRisk, sendWeeklySummaries } from "@/server/notifications/player";
import { hasDb, makeCategory, makeUser, resetDb } from "./helpers";

const DAY = 86_400_000;
const HOUR = 3_600_000;

type Cat = { id: string };
const leagueQuiz = (cat: Cat, title: string, opensAt: number, closesAt: number) =>
  prisma.quiz.create({
    data: {
      title,
      categoryId: cat.id,
      publishedAt: new Date(opensAt - DAY),
      opensAt: new Date(opensAt),
      closesAt: new Date(closesAt),
      expiresAt: new Date(closesAt + 30 * DAY),
    },
  });
const join = (cat: Cat, userId: string, status: "ACTIVE" | "LEAVING" = "ACTIVE") =>
  prisma.categoryMembership.create({ data: { categoryId: cat.id, userId, status, joinedAt: new Date(Date.now() - 20 * DAY) } });
const play = (quizId: string, userId: string, score = 0, finishedAt = new Date()) =>
  prisma.attempt.create({
    data: { quizId, userId, status: "FINISHED", score, startedAt: finishedAt, finishedAt, deadlineAt: new Date(finishedAt.getTime() + 600_000) },
  });

const note = (key: string) => ({ level: "INFO" as const, kind: "test", title: key, href: "/algo", dedupeKey: key });

describe.skipIf(!hasDb)("notificaciones", () => {
  beforeEach(resetDb);

  it("se marcan de a una o todas las de una audiencia, y solo las propias", async () => {
    const admin = await makeUser("ADMIN");
    const other = await makeUser();
    await notifyStaff(note("s1"));
    await notifyStaff(note("s2"));
    await notifyUsers([admin.id, other.id], note("p1"));
    expect(await unreadCount(admin.id, "STAFF")).toBe(2);
    expect(await unreadCount(admin.id, "PLAYER")).toBe(1);

    const [s1] = await prisma.notification.findMany({ where: { userId: admin.id, dedupeKey: "s1" } });
    // Otro usuario no puede abrir (ni marcar) una ajena.
    expect(await openNotification(other.id, s1.id)).toBeNull();
    expect(await markRead(other.id, { ids: [s1.id] })).toBe(0);
    expect(await unreadCount(admin.id, "STAFF")).toBe(2);

    expect(await openNotification(admin.id, s1.id)).toMatchObject({ href: "/algo", audience: "STAFF" });
    expect(await unreadCount(admin.id, "STAFF")).toBe(1);

    expect(await markRead(admin.id, { audience: "STAFF" })).toBe(1);
    expect(await unreadCount(admin.id, "STAFF")).toBe(0);
    expect(await unreadCount(admin.id, "PLAYER")).toBe(1); // la otra audiencia no se toca
    expect(await unreadCount(other.id, "PLAYER")).toBe(1);
  });

  it("al cerrar un cuestionario avisa una vez a quienes lo terminaron", async () => {
    const cat = await makeCategory();
    const [ana, beto, caro] = [await makeUser(), await makeUser(), await makeUser()];
    const now = new Date();
    const quiz = await prisma.quiz.create({
      data: {
        title: "Cerrado",
        categoryId: cat.id,
        publishedAt: new Date(now.getTime() - 5 * DAY),
        opensAt: new Date(now.getTime() - 4 * DAY),
        closesAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 30 * DAY),
      },
    });
    const open = await prisma.quiz.create({
      data: {
        title: "Abierto",
        categoryId: cat.id,
        publishedAt: new Date(now.getTime() - DAY),
        opensAt: new Date(now.getTime() - DAY),
        closesAt: new Date(now.getTime() + DAY),
        expiresAt: new Date(now.getTime() + 30 * DAY),
      },
    });
    const base = { startedAt: new Date(now.getTime() - 2 * DAY), deadlineAt: new Date(now.getTime() - 2 * DAY + 600_000) };
    const finished = await prisma.attempt.create({ data: { ...base, userId: ana.id, quizId: quiz.id, status: "FINISHED" } });
    await prisma.attempt.create({ data: { ...base, userId: beto.id, quizId: quiz.id, status: "CANCELLED" } });
    await prisma.attempt.create({ data: { ...base, userId: caro.id, quizId: open.id, status: "FINISHED" } });

    expect(await notifyReviewReady(now)).toEqual({ quizzes: 1, sent: 1 });
    const notes = await prisma.notification.findMany({ where: { kind: "quiz.reviewReady" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: ana.id, audience: "PLAYER", href: `/resultados/${finished.id}` });
    expect(await notifyReviewReady(now)).toEqual({ quizzes: 0, sent: 0 });
  });
  it("al abrir un cuestionario de liga avisa a los participantes activos, una sola vez", async () => {
    const cat = await makeCategory();
    const [ana, beto, caro] = [await makeUser(), await makeUser(), await makeUser()];
    await join(cat, ana.id);
    await join(cat, beto.id, "LEAVING");
    const now = Date.now();
    const fresh = await leagueQuiz(cat, "Recién abierto", now - 60_000, now + 2 * DAY);
    await leagueQuiz(cat, "Abrió hace rato", now - 2 * DAY, now + DAY); // worker caído: ya no es "nuevo"
    await leagueQuiz(cat, "Futuro", now + HOUR, now + 3 * DAY);

    expect(await notifyQuizOpened()).toEqual({ quizzes: 2, sent: 1 });
    const notes = await prisma.notification.findMany({ where: { kind: "quiz.opened" } });
    expect(notes).toMatchObject([{ userId: ana.id, audience: "PLAYER", href: `/categorias/${cat.slug}` }]);
    expect(notes[0].body).toContain(fresh.title);
    expect(await notifyQuizOpened()).toEqual({ quizzes: 0, sent: 0 });
    expect(await prisma.notification.count({ where: { userId: { in: [beto.id, caro.id] } } })).toBe(0);
  });

  it("no avisa la apertura si la categoría lo apagó", async () => {
    const cat = await makeCategory();
    await prisma.category.update({ where: { id: cat.id }, data: { settings: { "notify.newQuiz": false } } });
    const ana = await makeUser();
    await join(cat, ana.id);
    await leagueQuiz(cat, "Abierto", Date.now() - 60_000, Date.now() + DAY);
    expect(await notifyQuizOpened()).toEqual({ quizzes: 1, sent: 0 });
  });

  it("racha en riesgo: avisa solo a quien tiene racha real de 2+ y no jugó el que está por cerrar", async () => {
    const cat = await makeCategory();
    const [ana, beto, caro] = [await makeUser(), await makeUser(), await makeUser()];
    for (const u of [ana, beto, caro]) await join(cat, u.id);
    const now = Date.now();
    const q1 = await leagueQuiz(cat, "Uno", now - 5 * DAY, now - 2 * DAY);
    const q2 = await leagueQuiz(cat, "Dos", now - 4 * DAY, now - DAY);
    const risky = await leagueQuiz(cat, "Tres", now - 2 * DAY, now + 3 * HOUR); // cierra dentro de las 6 h
    await leagueQuiz(cat, "Cuatro", now - DAY, now + 2 * DAY); // abierto, pero lejos del cierre

    for (const u of [ana, beto]) {
      await play(q1.id, u.id);
      await play(q2.id, u.id);
    }
    await play(risky.id, beto.id); // ya lo jugó
    await play(q1.id, caro.id); // dejó cerrar "Dos" sin jugar: la racha guardada está vieja
    for (const u of [ana, beto, caro]) await prisma.streakState.create({ data: { userId: u.id, categoryId: cat.id, current: 2, best: 2 } });

    expect((await notifyStreakRisk()).sent).toBe(1);
    const notes = await prisma.notification.findMany({ where: { kind: "streak.risk" } });
    expect(notes).toMatchObject([{ userId: ana.id, level: "WARNING", title: `${cat.name}: tu racha de 2 está en riesgo` }]);
    expect((await notifyStreakRisk()).sent).toBe(0);
  });

  it("resumen semanal: puesto, racha y mejor puntaje por categoría, una vez por semana", async () => {
    const cat = await makeCategory();
    const [ana, beto] = [await makeUser(), await makeUser()];
    await join(cat, ana.id);
    await join(cat, beto.id);
    const now = Date.now();
    const q1 = await leagueQuiz(cat, "Uno", now - 3 * DAY, now - DAY);
    const q2 = await leagueQuiz(cat, "Dos", now - 2 * DAY, now + DAY);
    await play(q1.id, ana.id, 300, new Date(now - 2 * DAY));
    await play(q2.id, ana.id, 800, new Date(now - DAY));
    await play(q1.id, beto.id, 50, new Date(now - 10 * DAY)); // fuera de la semana
    await prisma.categoryStanding.create({
      data: { categoryId: cat.id, userId: ana.id, rank: 1, points: 1100, quizzesCounted: 2, correctCount: 0, totalTimeMs: 0 },
    });

    expect(await sendWeeklySummaries(new Date(), prisma, { force: true })).toEqual({ users: 2, sent: 2 });
    const [a] = await prisma.notification.findMany({ where: { userId: ana.id, kind: "weekly.summary" } });
    expect(a.body).toBe(`${cat.name}: puesto #1 de 1 · racha de 2 · 2 jugados, mejor 800 pts`);
    const [b] = await prisma.notification.findMany({ where: { userId: beto.id, kind: "weekly.summary" } });
    expect(b.body).toBe(`${cat.name}: sin puesto todavía · no jugaste esta semana`);
    expect(await sendWeeklySummaries(new Date(), prisma, { force: true })).toEqual({ users: 2, sent: 0 });
    // Fuera del lunes no sale (el worker corre todo al arrancar).
    expect(await sendWeeklySummaries(new Date("2026-10-13T15:00:00Z"))).toEqual({ users: 0, sent: 0 });
  });
});
