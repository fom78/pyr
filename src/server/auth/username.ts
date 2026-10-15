import { z } from "zod";
import { prisma, type Db } from "@/server/db";
import { UserError } from "@/server/errors";
import { logAudit } from "@/server/audit";

/** Mismo formato que valida el plugin `username` de Better Auth (ver `USERNAME_RE` en auth.ts). */
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;
const PLACEHOLDER_DOMAIN = "@sin-email.invalid";
const MAX_BASE = 20; // deja lugar para el sufijo numérico (máx. 24)
const DAY = 86_400_000;
/** Un cambio de usuario cada tanto, para que no se use para confundir en las tablas. */
export const USERNAME_CHANGE_DAYS = 30;

/**
 * Base para un nombre de usuario automático (pura): la parte local del mail, o el nombre si el mail
 * es el de relleno. Minúsculas, sin acentos, solo letras, números, "_" y ".", de 3 a 20 caracteres.
 */
export function usernameBase(email: string | null | undefined, name: string | null | undefined) {
  const source = email && !email.endsWith(PLACEHOLDER_DOMAIN) ? email.split("@")[0] : (name ?? "");
  let base = source
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_.]/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, MAX_BASE);
  if (base.length < 3) base = base ? `${base}${"_".repeat(3 - base.length)}` : "jugador";
  return base;
}

/** Primer usuario libre: base, base2, base3… (los usuarios se guardan en minúsculas). */
export async function availableUsername(base: string, db: Db = prisma) {
  const taken = new Set(
    (await db.user.findMany({ where: { username: { startsWith: base } }, select: { username: true } })).map((u) => u.username),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const usernameInput = z
  .string()
  .trim()
  .regex(USERNAME_RE, "De 3 a 24 caracteres: letras, números, guion bajo o punto.");

/**
 * Cambia el nombre de usuario. El primero es libre (los que vienen de Google lo traen automático);
 * después, uno cada `USERNAME_CHANGE_DAYS` días.
 */
export async function changeUsername(userId: string, raw: unknown, now = new Date(), db: Db = prisma) {
  const parsed = usernameInput.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  const display = parsed.data;
  const username = display.toLowerCase();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true, usernameChangedAt: true } });
  if (user.username === username) {
    await db.user.update({ where: { id: userId }, data: { displayUsername: display } });
    return { username, changed: false };
  }
  if (user.usernameChangedAt && now.getTime() - user.usernameChangedAt.getTime() < USERNAME_CHANGE_DAYS * DAY) {
    const next = new Date(user.usernameChangedAt.getTime() + USERNAME_CHANGE_DAYS * DAY);
    throw new UserError(`Ya cambiaste tu usuario hace poco. Vas a poder cambiarlo de nuevo el ${next.toLocaleDateString("es-AR")}.`);
  }
  if (await db.user.findFirst({ where: { username, NOT: { id: userId } }, select: { id: true } }))
    throw new UserError("Ese nombre de usuario ya está en uso.");
  await db.user.update({ where: { id: userId }, data: { username, displayUsername: display, usernameChangedAt: now } });
  await logAudit({ actorId: userId, action: "user.changeUsername", entityType: "User", entityId: userId, before: { username: user.username }, after: { username } }, db);
  return { username, changed: true };
}

/** Usuarios sin nombre de usuario (altas viejas con Google): les asigna uno. Idempotente. */
export async function backfillUsernames(db: Db = prisma) {
  const missing = await db.user.findMany({ where: { username: null }, select: { id: true, email: true, name: true } });
  for (const u of missing) {
    const username = await availableUsername(usernameBase(u.email, u.name), db);
    await db.user.update({ where: { id: u.id }, data: { username, displayUsername: username } });
  }
  return missing.length;
}

/** Cuenta creada hace menos de `days` días (para mostrarle el usuario automático en la bienvenida). */
export function isNewAccount(createdAt: Date, now = new Date(), days = 7) {
  return now.getTime() - createdAt.getTime() < days * DAY;
}
