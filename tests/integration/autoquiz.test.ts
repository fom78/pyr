import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { setSetting } from "@/server/config/service";
import {
  fillDraft,
  fillIncompleteDrafts,
  generateDrafts,
  handleDueDrafts,
  notifyCoverage,
  regenerateDraft,
  replaceQuestion,
  saveSchedule,
} from "@/server/autoquiz/service";
import { deleteDraftQuiz, publishQuiz } from "@/server/quiz/service";
import { banUser } from "@/server/users/service";
import { hasDb, makeCategory, makeQuestions, makeUser, resetDb } from "./helpers";

const DAY = 86_400_000;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

async function setup(opts: { questions: number; perQuiz?: number }) {
  const admin = await makeUser("ADMIN");
  const cat = await makeCategory();
  const questions = await makeQuestions(cat.id, opts.questions);
  await setSetting("quiz.questionCount", opts.perQuiz ?? 3, admin.id);
  await setSetting("autoquiz.horizonDays", 7, admin.id);
  await setSetting("autoquiz.alertHours", 24, admin.id);
  await saveSchedule(
    cat.id,
    {
      enabled: true,
      weekdays: ALL_DAYS,
      timeOfDay: "20:00",
      titleTemplate: "{categoria} #{n}",
      difficultyMix: null,
      timeMode: "PER_QUESTION",
    },
    admin,
  );
  return { admin, cat, questions };
}

const drafts = (categoryId: string) =>
  prisma.quiz.findMany({
    where: { categoryId, scheduleId: { not: null } },
    include: { questions: true },
    orderBy: { opensAt: "asc" },
  });

describe.skipIf(!hasDb)("cuestionarios automáticos", () => {
  beforeEach(resetDb);

  it("genera un borrador por turno, sin repetir preguntas y sin duplicar al correr dos veces", async () => {
    const { cat } = await setup({ questions: 30 });
    const first = await generateDrafts();
    // Turnos diarios entre ahora+24h y ahora+7d: 6 (o 7 según la hora del día).
    expect(first.created).toBeGreaterThanOrEqual(6);
    expect((await generateDrafts()).created).toBe(0);

    const list = await drafts(cat.id);
    expect(list).toHaveLength(first.created);
    const ids = list.flatMap((q) => q.questions.map((x) => x.questionId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(list.every((q) => q.publishedAt === null && q.questions.length === 3)).toBe(true);
  });

  it("si no alcanzan las nuevas reutiliza las más viejas (respetando reuseAfterDays) o deja el borrador incompleto", async () => {
    const { admin, cat, questions } = await setup({ questions: 4 });
    await setSetting("autoquiz.reuseAfterDays", 30, admin.id);
    // Dos preguntas se jugaron hace 100 días: se pueden reutilizar.
    await prisma.quiz.create({
      data: {
        title: "viejo",
        categoryId: cat.id,
        publishedAt: new Date(Date.now() - 101 * DAY),
        opensAt: new Date(Date.now() - 100 * DAY),
        closesAt: new Date(Date.now() - 97 * DAY),
        expiresAt: new Date(Date.now() - 60 * DAY),
        questions: { create: [0, 1].map((i) => ({ questionId: questions[i].id, position: i })) },
      },
    });
    await generateDrafts();
    const list = await drafts(cat.id);
    // 2 nuevas + 2 reutilizables = 4 preguntas para borradores de 3: el primero completo (2 nuevas + 1 reutilizada)...
    expect(list[0].questions).toHaveLength(3);
    expect(list[0].questions.filter((q) => q.reused)).toHaveLength(1);
    // ...el segundo con lo que queda y el resto vacíos (incompletos, visibles para el admin).
    expect(list[1].questions).toHaveLength(1);
    expect(list.slice(2).every((q) => q.questions.length === 0)).toBe(true);
  });

  it("vencido sin aprobar se descarta y avisa; con autoPublish se publica solo", async () => {
    const { admin, cat } = await setup({ questions: 30 });
    const mod = await makeUser("MOD");
    await generateDrafts();
    await setSetting("autoquiz.autoPublish", false, admin.id);
    const [first, second] = await drafts(cat.id);

    // El primero llega a su apertura sin aprobar.
    await handleDueDrafts(new Date(first.opensAt.getTime() + 1000));
    expect(await prisma.quiz.findUnique({ where: { id: first.id } })).toBeNull();
    expect(await prisma.notification.count({ where: { kind: "draft.skipped" } })).toBe(2); // admin y mod
    // Las preguntas vuelven al banco.
    expect(await prisma.quizQuestion.count({ where: { quizId: first.id } })).toBe(0);

    await setSetting("autoquiz.autoPublish", true, admin.id);
    await setSetting("autoquiz.autoPublishHours", 12, admin.id);
    // Antes del anticipo no se publica; pasado, se publica solo y avisa.
    await handleDueDrafts(new Date(second.opensAt.getTime() - 13 * 3_600_000));
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: second.id } })).publishedAt).toBeNull();
    await handleDueDrafts(new Date(second.opensAt.getTime() - 11 * 3_600_000));
    expect(await prisma.notification.count({ where: { kind: "draft.autoPublished" } })).toBe(2);
    const published = await prisma.quiz.findUniqueOrThrow({ where: { id: second.id } });
    expect(published.publishedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "quiz.publish", entityId: second.id, actorId: null } })).toBe(1);
    expect(mod).toBeTruthy();
  });

  it("saltear un turno no lo vuelve a generar", async () => {
    const { admin, cat } = await setup({ questions: 30 });
    await generateDrafts();
    const [first] = await drafts(cat.id);
    await deleteDraftQuiz(first.id, admin);
    await generateDrafts();
    const list = await drafts(cat.id);
    expect(list.some((q) => q.slotAt?.getTime() === first.slotAt?.getTime())).toBe(false);
  });

  it("cambiar una pregunta y regenerar usan preguntas que no están en otros borradores", async () => {
    const { admin, cat } = await setup({ questions: 40 });
    await generateDrafts();
    const [first] = await drafts(cat.id);
    const before = first.questions[0];
    const picked = await replaceQuestion(first.id, before.id, admin);
    expect(picked.id).not.toBe(before.questionId);

    const r = await regenerateDraft(first.id, admin);
    expect(r).toEqual({ count: 3, missing: 0 });
    const all = (await drafts(cat.id)).flatMap((q) => q.questions.map((x) => x.questionId));
    expect(new Set(all).size).toBe(all.length);
  });

  it("completa los borradores incompletos cuando se cargan preguntas, sin cambiar las que ya tenían", async () => {
    const { admin, cat } = await setup({ questions: 4 });
    await setSetting("autoquiz.allowReuse", false, admin.id);
    await generateDrafts();
    const before = await drafts(cat.id);
    expect(before[0].questions).toHaveLength(3);
    expect(before[1].questions).toHaveLength(1);
    expect(before.slice(2).every((q) => q.questions.length === 0)).toBe(true);

    // Con 4 preguntas más: se completa primero el más próximo.
    await makeQuestions(cat.id, 4);
    expect((await fillIncompleteDrafts()).filled).toBe(2);
    let after = await drafts(cat.id);
    expect(after[1].questions.map((q) => q.questionId)).toEqual(expect.arrayContaining(before[1].questions.map((q) => q.questionId)));
    expect(after[1].questions).toHaveLength(3);
    expect(after[2].questions).toHaveLength(2);

    // Botón "Completar": usa las que haya y no repite entre borradores.
    await makeQuestions(cat.id, 1);
    await expect(fillDraft(after[0].id, admin)).rejects.toThrow(/ya tiene todas/);
    expect(await fillDraft(after[2].id, admin)).toEqual({ added: 1, missing: 0 });
    await expect(fillDraft(after[3].id, admin)).rejects.toThrow(/No hay preguntas/);
    after = await drafts(cat.id);
    const ids = after.flatMap((q) => q.questions.map((x) => x.questionId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(after[0].questions.map((q) => q.questionId)).toEqual(before[0].questions.map((q) => q.questionId));
  });

  it("publicar un cuestionario de liga exige la cantidad fija de preguntas", async () => {
    const { admin, cat, questions } = await setup({ questions: 5, perQuiz: 3 });
    const quiz = await prisma.quiz.create({
      data: {
        title: "manual",
        categoryId: cat.id,
        opensAt: new Date(Date.now() + 30 * DAY),
        closesAt: new Date(Date.now() + 33 * DAY),
        expiresAt: new Date(Date.now() + 60 * DAY),
        questions: { create: [0, 1].map((i) => ({ questionId: questions[i].id, position: i })) },
      },
    });
    await expect(publishQuiz(quiz.id, admin)).rejects.toThrow(/exactamente 3 preguntas/);
    await prisma.quizQuestion.create({ data: { quizId: quiz.id, questionId: questions[2].id, position: 2 } });
    await publishQuiz(quiz.id, admin);
  });

  it("avisa a admins y mods (no a jugadores ni baneados) cuando el banco no alcanza, una vez por semana y nivel", async () => {
    const { admin, cat } = await setup({ questions: 4 });
    const mod = await makeUser("MOD");
    const bannedMod = await makeUser("MOD");
    const player = await makeUser();
    await banUser(bannedMod.id, { reason: "prueba", endsAt: null }, admin);
    await setSetting("autoquiz.coverageWarnDays", 21, admin.id);
    await setSetting("autoquiz.coverageCriticalDays", 7, admin.id);

    const r = await notifyCoverage();
    expect(r.sent).toBe(2);
    const notes = await prisma.notification.findMany({ where: { kind: "bank.coverage" } });
    expect(new Set(notes.map((n) => n.userId))).toEqual(new Set([admin.id, mod.id]));
    expect(notes[0].level).toBe("CRITICAL");
    expect(notes[0].title).toContain(cat.name);
    expect(player).toBeTruthy();

    // Mismo día: no se repite.
    expect((await notifyCoverage()).sent).toBe(0);
  });
});
