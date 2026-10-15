import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import { availableUsername, backfillUsernames, changeUsername, USERNAME_CHANGE_DAYS } from "@/server/auth/username";
import { hasDb, makeUser, resetDb } from "./helpers";

const DAY = 86_400_000;

describe.skipIf(!hasDb)("nombres de usuario", () => {
  beforeEach(resetDb);

  it("availableUsername agrega un número si está ocupado", async () => {
    await makeUser("USER", "juan");
    await makeUser("USER", "juan2");
    expect(await availableUsername("juan")).toBe("juan3");
    expect(await availableUsername("pedro")).toBe("pedro");
  });

  it("un alta sin usuario (como la de Google) recibe uno automático", async () => {
    await makeUser("USER", "ana");
    const ctx = await auth.$context;
    // Mismo camino que un alta con Google.
    const { user: created } = await ctx.internalAdapter.createOAuthUser(
      { email: "ana@gmail.com", name: "Ana García", emailVerified: true },
      { providerId: "google", accountId: "google-123" },
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(user.username).toBe("ana2");
    expect(user.displayUsername).toBe("ana2");
  });

  it("cambiar el usuario: rechaza duplicados y después del primer cambio espera 30 días", async () => {
    const u = await makeUser("USER", "juan");
    await makeUser("USER", "ocupado");
    await expect(changeUsername(u.id, "Ocupado")).rejects.toThrow("ya está en uso");
    await expect(changeUsername(u.id, "a b")).rejects.toThrow("De 3 a 24");

    const now = new Date();
    expect(await changeUsername(u.id, "Juancito", now)).toEqual({ username: "juancito", changed: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).displayUsername).toBe("Juancito");
    await expect(changeUsername(u.id, "otro", new Date(now.getTime() + DAY))).rejects.toThrow("hace poco");
    // Cambiar solo mayúsculas no cuenta como cambio.
    expect(await changeUsername(u.id, "JUANCITO", new Date(now.getTime() + DAY))).toEqual({ username: "juancito", changed: false });
    expect((await changeUsername(u.id, "otro", new Date(now.getTime() + (USERNAME_CHANGE_DAYS + 1) * DAY))).changed).toBe(true);
  });

  it("el relleno asigna usuario a las cuentas que no tienen y es idempotente", async () => {
    await prisma.user.create({ data: { name: "Sin Usuario", email: "sinusuario@gmail.com" } });
    expect(await backfillUsernames()).toBe(1);
    expect(await backfillUsernames()).toBe(0);
    expect((await prisma.user.findFirstOrThrow({ where: { email: "sinusuario@gmail.com" } })).username).toBe("sinusuario");
  });
});
