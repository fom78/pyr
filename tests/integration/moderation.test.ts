import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { adjustCredits, banUser, revokeBan, setUserRole } from "@/server/users/service";
import { getBalance } from "@/server/credits/service";
import { recomputeCategoryStandings } from "@/server/ranking/service";
import { hasDb, makeCategory, makeQuestions, makeUser, resetDb } from "./helpers";

const DAY = 86_400_000;

describe.skipIf(!hasDb)("moderación", () => {
  beforeEach(resetDb);

  it("un usuario baneado sale de la tabla y vuelve al levantar el baneo", async () => {
    const cat = await makeCategory();
    const [q] = await makeQuestions(cat.id, 1);
    const admin = await makeUser("ADMIN");
    const [a, b] = [await makeUser(), await makeUser()];
    const quiz = await prisma.quiz.create({
      data: {
        title: "Q",
        categoryId: cat.id,
        publishedAt: new Date(Date.now() - 5 * DAY),
        opensAt: new Date(Date.now() - 4 * DAY),
        closesAt: new Date(Date.now() - DAY),
        expiresAt: new Date(Date.now() + 20 * DAY),
        questions: { create: { questionId: q.id, position: 0 } },
      },
    });
    for (const [u, score] of [
      [a, 300],
      [b, 100],
    ] as const) {
      await prisma.categoryMembership.create({ data: { userId: u.id, categoryId: cat.id } });
      await prisma.attempt.create({
        data: { quizId: quiz.id, userId: u.id, status: "FINISHED", deadlineAt: new Date(), finishedAt: new Date(), score },
      });
    }
    await recomputeCategoryStandings(cat.id);
    expect(await prisma.categoryStanding.count({ where: { categoryId: cat.id } })).toBe(2);

    const ban = await banUser(a.id, { reason: "trampa", endsAt: null }, admin);
    const rows = await prisma.categoryStanding.findMany({ where: { categoryId: cat.id } });
    expect(rows.map((r) => r.userId)).toEqual([b.id]);
    expect(rows[0].rank).toBe(1);

    await revokeBan(ban.id, admin);
    expect(await prisma.categoryStanding.count({ where: { categoryId: cat.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: { in: ["ban.create", "ban.revoke"] } } })).toBe(2);
  });

  it("no se puede banear a un admin ni a uno mismo; un mod no puede banear a otro mod", async () => {
    const admin = await makeUser("ADMIN");
    const mod = await makeUser("MOD");
    const mod2 = await makeUser("MOD");
    await expect(banUser(admin.id, { reason: "xxx", endsAt: null }, mod)).rejects.toThrow(/admin/);
    await expect(banUser(mod.id, { reason: "xxx", endsAt: null }, mod)).rejects.toThrow(/vos mismo/);
    await expect(banUser(mod2.id, { reason: "xxx", endsAt: null }, mod)).rejects.toThrow(/Solo un admin/);
  });

  it("ajuste de créditos exige motivo y queda auditado", async () => {
    const admin = await makeUser("ADMIN");
    const u = await makeUser();
    await expect(adjustCredits(u.id, { amount: 50, reason: "" }, admin)).rejects.toThrow();
    await adjustCredits(u.id, { amount: 50, reason: "Compensación por error" }, admin);
    expect(await getBalance(u.id)).toBe(50);
    expect(await prisma.auditLog.count({ where: { action: "credits.adjust", entityId: u.id } })).toBe(1);
  });

  it("siempre queda al menos un admin", async () => {
    const admin = await makeUser("ADMIN");
    const other = await makeUser("ADMIN");
    await setUserRole(other.id, "USER", admin);
    await expect(setUserRole(admin.id, "USER", admin)).rejects.toThrow(/propio rol/);
  });
});
