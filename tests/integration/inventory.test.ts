import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { setSetting } from "@/server/config/service";
import { joinCategory, getLivesSummary } from "@/server/league/service";
import { adjustStars, exchangeStarsForLife, getInventory, grantExtraLife, postInventory } from "@/server/inventory/service";
import { getPublicProfile } from "@/server/player/public-profile";
import { hasDb, makeCategory, makeUser, resetDb } from "./helpers";

describe.skipIf(!hasDb)("vidas extra y estrellas", () => {
  beforeEach(resetDb);

  it("sin saldos negativos e idempotente", async () => {
    const u = await makeUser();
    const tx = { userId: u.id, asset: "STAR" as const, amount: 5, type: "TOURNAMENT_PRIZE" as const, reason: "Premio", idempotencyKey: "k1" };
    await postInventory(tx);
    await postInventory(tx);
    expect(await getInventory(u.id)).toEqual({ stars: 5, extraLives: 0 });
    await expect(
      postInventory({ ...tx, amount: -6, type: "EXCHANGE", idempotencyKey: "k2" }),
    ).rejects.toThrow("No alcanza");
  });

  it("canje: descuenta estrellas, suma una vida y respeta el tope", async () => {
    const admin = await makeUser("ADMIN");
    const u = await makeUser();
    await setSetting("lives.cap", 4, admin.id);
    await setSetting("lives.starsPerLife", 10, admin.id);
    await expect(exchangeStarsForLife(u.id)).rejects.toThrow("Necesitás 10 estrellas");
    await adjustStars(u.id, { amount: 25, reason: "Premio especial" }, admin);
    expect(await exchangeStarsForLife(u.id)).toEqual({ capacity: 4, stars: 15 });
    await expect(exchangeStarsForLife(u.id)).rejects.toThrow("máximo de 4 vidas");
    expect(await getInventory(u.id)).toEqual({ stars: 15, extraLives: 1 });
    expect(await prisma.notification.count({ where: { userId: u.id, kind: "inventory.stars" } })).toBe(1);
  });

  it("una vida extra permite una categoría más; quitarla no saca de la categoría pero bloquea sumar otra", async () => {
    const admin = await makeUser("ADMIN");
    const u = await makeUser();
    const cats = await Promise.all([1, 2, 3, 4, 5].map(() => makeCategory()));
    for (const c of cats.slice(0, 3)) await joinCategory(u.id, c.id);
    await expect(joinCategory(u.id, cats[3].id)).rejects.toThrow("Ya usaste tus 3 vidas");

    await grantExtraLife(u.id, { delta: 1, reason: "Gracias por moderar" }, admin);
    expect(await prisma.notification.count({ where: { userId: u.id, kind: "inventory.life" } })).toBe(1);
    await joinCategory(u.id, cats[3].id);
    expect(await getLivesSummary(u.id)).toMatchObject({ max: 4, used: 4, free: 0, locked: 1 });

    await grantExtraLife(u.id, { delta: -1, reason: "Corrección del equipo" }, admin);
    expect(await prisma.categoryMembership.count({ where: { userId: u.id, status: "ACTIVE" } })).toBe(4);
    expect(await getLivesSummary(u.id)).toMatchObject({ max: 3, used: 4, free: 0, locked: 2 });
    await expect(joinCategory(u.id, cats[4].id)).rejects.toThrow("Ya usaste tus 3 vidas");
    await expect(grantExtraLife(u.id, { delta: -1, reason: "Otra corrección" }, admin)).rejects.toThrow("No tiene vidas extra");
    expect(await prisma.auditLog.count({ where: { action: "inventory.life", entityId: u.id } })).toBe(2);
  });

  it("perfil público: busca sin importar mayúsculas, no muestra a los baneados", async () => {
    const admin = await makeUser("ADMIN");
    const u = await makeUser("USER", "juana");
    const cat = await makeCategory();
    await joinCategory(u.id, cat.id);
    const p = await getPublicProfile("Juana");
    expect(p).toMatchObject({ user: { id: u.id }, stats: { quizzes: 0, accuracy: null, activeCategories: 1 } });
    expect(p!.league[0]).toMatchObject({ category: { id: cat.id }, rank: null });
    expect(JSON.stringify(p)).not.toContain("@test.invalid");

    await prisma.ban.create({ data: { userId: u.id, reason: "spam", createdById: admin.id } });
    expect(await getPublicProfile("juana")).toBeNull();
    expect(await getPublicProfile("nadie")).toBeNull();
  });
});
