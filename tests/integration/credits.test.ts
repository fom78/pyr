import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createPendingPurchase, getBalance, InsufficientCreditsError, postTransaction, settlePurchase } from "@/server/credits/service";
import { hasDb, makeUser, resetDb } from "./helpers";

describe.skipIf(!hasDb)("ledger de créditos", () => {
  beforeEach(resetDb);

  it("el saldo es la suma de movimientos aprobados", async () => {
    const u = await makeUser();
    await postTransaction({ userId: u.id, amount: 100, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: "a" });
    await postTransaction({ userId: u.id, amount: -30, type: "TOURNAMENT_ENTRY", reason: "torneo", idempotencyKey: "b" });
    expect(await getBalance(u.id)).toBe(70);
  });

  it("es idempotente por idempotencyKey", async () => {
    const u = await makeUser();
    await postTransaction({ userId: u.id, amount: 100, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: "signup" });
    await postTransaction({ userId: u.id, amount: 100, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: "signup" });
    expect(await getBalance(u.id)).toBe(100);
  });

  it("no permite saldo negativo", async () => {
    const u = await makeUser();
    await postTransaction({ userId: u.id, amount: 10, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: "a" });
    await expect(
      postTransaction({ userId: u.id, amount: -11, type: "TOURNAMENT_ENTRY", reason: "x", idempotencyKey: "b" }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("débitos concurrentes no dejan el saldo negativo (lock por usuario)", async () => {
    const u = await makeUser();
    await postTransaction({ userId: u.id, amount: 50, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: "a" });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        postTransaction({ userId: u.id, amount: -20, type: "TOURNAMENT_ENTRY", reason: "x", idempotencyKey: `d${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await getBalance(u.id)).toBe(10);
  });

  it("el mismo cobro enviado dos veces en paralelo se registra una sola vez", async () => {
    const u = await makeUser();
    await postTransaction({ userId: u.id, amount: 50, type: "SIGNUP_BONUS", reason: "bono", idempotencyKey: "a" });
    await Promise.allSettled([1, 2, 3].map(() =>
      postTransaction({ userId: u.id, amount: -20, type: "TOURNAMENT_ENTRY", reason: "x", idempotencyKey: "entry:t1" }),
    ));
    expect(await prisma.creditTransaction.count({ where: { userId: u.id } })).toBe(2);
    expect(await getBalance(u.id)).toBe(30);
  });

  it("compra pendiente no suma hasta aprobarse; settle es idempotente", async () => {
    const u = await makeUser();
    await createPendingPurchase({ userId: u.id, amount: 500, externalRef: "mp-123" });
    expect(await getBalance(u.id)).toBe(0);
    await settlePurchase("mp-123", true);
    await settlePurchase("mp-123", false); // ya resuelta: no cambia
    expect(await getBalance(u.id)).toBe(500);
  });
});
