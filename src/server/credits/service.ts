import { prisma, type Db, type Tx } from "@/server/db";
import type { CreditTxStatus, CreditTxType, Prisma } from "@/generated/prisma/client";

/**
 * Libro contable de créditos. El saldo SIEMPRE se deriva de los movimientos APPROVED.
 * Toda escritura pasa por `postTransaction`, que:
 *  - serializa por usuario con SELECT … FOR UPDATE sobre su fila,
 *  - es idempotente por `idempotencyKey` (reintentos no duplican),
 *  - impide saldos negativos.
 * La futura integración de pagos (Mercado Pago) solo necesita createPendingPurchase + settlePurchase.
 */

export class InsufficientCreditsError extends Error {
  constructor(public balance: number, public required: number) {
    super(`Saldo insuficiente: tenés ${balance} créditos y necesitás ${required}.`);
    this.name = "InsufficientCreditsError";
  }
}

export type PostTxInput = {
  userId: string;
  amount: number;
  type: CreditTxType;
  reason: string;
  idempotencyKey: string;
  status?: CreditTxStatus;
  externalRef?: string;
  meta?: Prisma.InputJsonValue;
  createdById?: string | null;
};

function isTx(db: Db): db is Tx {
  return !("$transaction" in db);
}

async function inTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return isTx(db) ? fn(db) : (db as typeof prisma).$transaction(fn);
}

export async function getBalance(userId: string, db: Db = prisma): Promise<number> {
  const agg = await db.creditTransaction.aggregate({
    where: { userId, status: "APPROVED" },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

export async function postTransaction(input: PostTxInput, db: Db = prisma) {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error("El monto debe ser un entero distinto de 0.");
  return inTx(db, async (tx) => {
    await lockUser(tx, input.userId);
    const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const status = input.status ?? "APPROVED";
    if (input.amount < 0 && status === "APPROVED") {
      const balance = await getBalance(input.userId, tx);
      if (balance + input.amount < 0) throw new InsufficientCreditsError(balance, -input.amount);
    }
    return tx.creditTransaction.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        type: input.type,
        status,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        externalRef: input.externalRef,
        meta: input.meta,
        createdById: input.createdById ?? null,
        settledAt: status === "APPROVED" ? new Date() : null,
      },
    });
  });
}

// ── Preparado para pasarela de pagos (no expuesto en UI todavía) ──

export async function createPendingPurchase(
  input: { userId: string; amount: number; externalRef: string; meta?: Prisma.InputJsonValue },
  db: Db = prisma,
) {
  if (input.amount <= 0) throw new Error("Una compra debe acreditar un monto positivo.");
  return postTransaction(
    {
      userId: input.userId,
      amount: input.amount,
      type: "PURCHASE",
      status: "PENDING",
      reason: "Compra de créditos",
      idempotencyKey: `purchase:${input.externalRef}`,
      externalRef: input.externalRef,
      meta: input.meta,
    },
    db,
  );
}

/** Lo llamará el webhook de la pasarela. Idempotente: un pago ya resuelto no cambia. */
export async function settlePurchase(externalRef: string, approved: boolean, db: Db = prisma) {
  return inTx(db, async (tx) => {
    const purchase = await tx.creditTransaction.findFirst({ where: { externalRef, type: "PURCHASE" } });
    if (!purchase) throw new Error(`Compra no encontrada: ${externalRef}`);
    await lockUser(tx, purchase.userId);
    if (purchase.status !== "PENDING") return purchase;
    return tx.creditTransaction.update({
      where: { id: purchase.id },
      data: { status: approved ? "APPROVED" : "REJECTED", settledAt: new Date() },
    });
  });
}
