import { z } from "zod";
import { prisma, type Db, type Tx } from "@/server/db";
import type { InventoryAsset, InventoryTxType, Prisma } from "@/generated/prisma/client";
import { getSettings } from "@/server/config/service";
import { UserError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { notifyUsers } from "@/server/notifications/service";
import { lifeCapacity, livesUsed } from "@/server/league/lives";

/**
 * Inventario del jugador: vidas extra y estrellas. Mismo modelo que los créditos: el saldo de cada
 * `asset` es la suma de sus movimientos y toda escritura pasa por `postInventory` (lock por usuario,
 * idempotencia, sin saldos negativos). Las vidas extra son permanentes; quitar una no saca al jugador
 * de ninguna categoría, solo le impide sumar otra.
 */

export type PostInventoryInput = {
  userId: string;
  asset: InventoryAsset;
  amount: number;
  type: InventoryTxType;
  reason: string;
  idempotencyKey: string;
  meta?: Prisma.InputJsonValue;
  createdById?: string | null;
};

function isTx(db: Db): db is Tx {
  return !("$transaction" in db);
}

async function inTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return isTx(db) ? fn(db) : (db as typeof prisma).$transaction(fn);
}

async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

export async function getInventory(userId: string, db: Db = prisma) {
  const rows = await db.inventoryTransaction.groupBy({ by: ["asset"], where: { userId }, _sum: { amount: true } });
  const sum = (a: InventoryAsset) => rows.find((r) => r.asset === a)?._sum.amount ?? 0;
  return { stars: sum("STAR"), extraLives: sum("EXTRA_LIFE") };
}

const ASSET_LABEL: Record<InventoryAsset, string> = { STAR: "estrellas", EXTRA_LIFE: "vidas extra" };

export async function postInventory(input: PostInventoryInput, db: Db = prisma) {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error("El monto debe ser un entero distinto de 0.");
  return inTx(db, async (tx) => {
    await lockUser(tx, input.userId);
    const existing = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    if (input.amount < 0) {
      const inv = await getInventory(input.userId, tx);
      const balance = input.asset === "STAR" ? inv.stars : inv.extraLives;
      if (balance + input.amount < 0) throw new UserError(`No alcanza: tiene ${balance} ${ASSET_LABEL[input.asset]}.`);
    }
    return tx.inventoryTransaction.create({
      data: {
        userId: input.userId,
        asset: input.asset,
        amount: input.amount,
        type: input.type,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        meta: input.meta,
        createdById: input.createdById ?? null,
      },
    });
  });
}

/** Vidas del jugador: iniciales + extra (hasta el tope), cuántas usa y cuánto cuesta desbloquear otra. */
export async function getLifeStatus(userId: string, now = new Date(), db: Db = prisma) {
  const [inv, s, memberships] = await Promise.all([
    getInventory(userId, db),
    getSettings(db),
    db.categoryMembership.findMany({ where: { userId } }),
  ]);
  const capacity = lifeCapacity({ base: s["lives.max"], extra: inv.extraLives, cap: s["lives.cap"] });
  const cap = Math.max(s["lives.cap"], s["lives.max"]);
  return {
    ...inv,
    base: s["lives.max"],
    capacity,
    cap,
    used: livesUsed(memberships, now),
    starsPerLife: s["lives.starsPerLife"],
    canExchange: capacity < cap && inv.stars >= s["lives.starsPerLife"],
  };
}

/** Canjea estrellas por una vida extra (si no llegó al tope). */
export async function exchangeStarsForLife(userId: string, db: typeof prisma = prisma) {
  return db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const st = await getLifeStatus(userId, new Date(), tx);
    if (st.capacity >= st.cap) throw new UserError(`Ya tenés el máximo de ${st.cap} vidas.`);
    if (st.stars < st.starsPerLife)
      throw new UserError(`Necesitás ${st.starsPerLife} estrellas para desbloquear una vida (tenés ${st.stars}).`);
    const key = `exchange:${userId}:${crypto.randomUUID()}`;
    await postInventory(
      { userId, asset: "STAR", amount: -st.starsPerLife, type: "EXCHANGE", reason: "Canje por una vida", idempotencyKey: `${key}:star` },
      tx,
    );
    await postInventory(
      { userId, asset: "EXTRA_LIFE", amount: 1, type: "EXCHANGE", reason: `Canje de ${st.starsPerLife} estrellas`, idempotencyKey: `${key}:life` },
      tx,
    );
    return { capacity: st.capacity + 1, stars: st.stars - st.starsPerLife };
  });
}

const reasonSchema = z.string().trim().min(5, "El motivo es obligatorio (mínimo 5 caracteres).").max(300);
const lifeInput = z.object({ delta: z.union([z.literal(1), z.literal(-1)]), reason: reasonSchema });
const starsInput = z.object({
  amount: z.coerce
    .number()
    .int("Debe ser un número entero.")
    .refine((n) => n !== 0, "El monto no puede ser 0.")
    .refine((n) => Math.abs(n) <= 100_000, "Monto demasiado grande."),
  reason: reasonSchema,
});

/**
 * El admin da (+1) o quita (−1) una vida extra. No pasa del tope y solo quita extras (nunca las
 * iniciales). Si la vida estaba en uso, el jugador sigue en sus categorías.
 */
export async function grantExtraLife(userId: string, raw: unknown, actor: { id: string }) {
  const input = lifeInput.parse(raw);
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const st = await getLifeStatus(userId, new Date(), tx);
    if (input.delta > 0 && st.capacity >= st.cap) throw new UserError(`Ya tiene el máximo de ${st.cap} vidas.`);
    if (input.delta < 0 && st.extraLives <= 0) throw new UserError("No tiene vidas extra para quitar.");
    await postInventory(
      {
        userId,
        asset: "EXTRA_LIFE",
        amount: input.delta,
        type: input.delta > 0 ? "ADMIN_GRANT" : "ADMIN_REVOKE",
        reason: input.reason,
        idempotencyKey: `life-adjust:${userId}:${crypto.randomUUID()}`,
        createdById: actor.id,
      },
      tx,
    );
  });
  await logAudit({ actorId: actor.id, action: "inventory.life", entityType: "User", entityId: userId, after: input });
  if (input.delta > 0)
    await notifyUsers([userId], {
      level: "INFO",
      kind: "inventory.life",
      title: "❤ Te dieron una vida extra",
      body: `${input.reason} Ya podés participar en una categoría más.`,
      href: "/categorias",
      dedupeKey: `inventory.life:${crypto.randomUUID()}`,
    });
}

/** Ajuste manual de estrellas por el admin (motivo obligatorio, auditoría y aviso si suma). */
export async function adjustStars(userId: string, raw: unknown, actor: { id: string }) {
  const input = starsInput.parse(raw);
  await postInventory({
    userId,
    asset: "STAR",
    amount: input.amount,
    type: input.amount > 0 ? "ADMIN_GRANT" : "ADMIN_REVOKE",
    reason: input.reason,
    idempotencyKey: `stars-adjust:${userId}:${crypto.randomUUID()}`,
    createdById: actor.id,
  });
  await logAudit({ actorId: actor.id, action: "inventory.stars", entityType: "User", entityId: userId, after: input });
  if (input.amount > 0)
    await notifyUsers([userId], {
      level: "INFO",
      kind: "inventory.stars",
      title: `⭐ Recibiste ${input.amount} ${input.amount === 1 ? "estrella" : "estrellas"}`,
      body: input.reason,
      href: "/creditos",
      dedupeKey: `inventory.stars:${crypto.randomUUID()}`,
    });
}

export async function listInventoryTransactions(userId: string, take = 50, db: Db = prisma) {
  return db.inventoryTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: { createdBy: { select: { name: true } } },
  });
}
