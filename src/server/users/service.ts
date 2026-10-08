import { z } from "zod";
import { prisma } from "@/server/db";
import type { Role } from "@/generated/prisma/enums";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { postTransaction } from "@/server/credits/service";
import { finalizeAttempt } from "@/server/game/engine";
import { recomputeCategoryStandings, recomputeTournamentStandings } from "@/server/ranking/service";

/** Recalcula las tablas donde figura (o figuraría) el usuario. */
async function recomputeUserTables(userId: string) {
  const [memberships, entries] = await Promise.all([
    prisma.categoryMembership.findMany({ where: { userId }, select: { categoryId: true } }),
    prisma.tournamentEntry.findMany({ where: { userId, tournament: { status: "PUBLISHED" } }, select: { tournamentId: true } }),
  ]);
  for (const c of new Set(memberships.map((m) => m.categoryId))) await recomputeCategoryStandings(c);
  for (const e of entries) await recomputeTournamentStandings(e.tournamentId);
}

export async function setUserRole(userId: string, role: Role, actor: { id: string }) {
  if (userId === actor.id) throw new UserError("No podés cambiar tu propio rol.");
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) throw new NotFoundError("Usuario");
  if (before.role === "ADMIN" && role !== "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN" } })) <= 1)
    throw new UserError("Tiene que quedar al menos un admin.");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await logAudit({ actorId: actor.id, action: "user.setRole", entityType: "User", entityId: userId, before: { role: before.role }, after: { role } });
}

export const banInput = z.object({
  reason: z.string().trim().min(3, "Indicá el motivo.").max(500),
  /** null = permanente */
  endsAt: z.coerce.date().nullable(),
});

/**
 * Banea: corta sus sesiones, cierra intentos en curso y lo saca de las tablas mientras dure.
 */
export async function banUser(userId: string, raw: unknown, actor: { id: string; role: Role }, now = new Date()) {
  const input = banInput.parse(raw);
  if (userId === actor.id) throw new UserError("No podés banearte a vos mismo.");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new NotFoundError("Usuario");
  if (target.role === "ADMIN") throw new UserError("No se puede banear a un admin.");
  if (target.role === "MOD" && actor.role !== "ADMIN") throw new UserError("Solo un admin puede banear a un moderador.");
  if (input.endsAt && input.endsAt <= now) throw new UserError("La fecha de fin debe ser futura.");
  const ban = await prisma.ban.create({ data: { userId, reason: input.reason, startsAt: now, endsAt: input.endsAt, createdById: actor.id } });
  await prisma.session.deleteMany({ where: { userId } });
  const open = await prisma.attempt.findMany({ where: { userId, status: "IN_PROGRESS" }, select: { id: true } });
  for (const a of open) await finalizeAttempt(a.id, now);
  await recomputeUserTables(userId);
  await logAudit({
    actorId: actor.id,
    action: "ban.create",
    entityType: "User",
    entityId: userId,
    after: { reason: input.reason, endsAt: input.endsAt },
    meta: { banId: ban.id, closedAttempts: open.length },
  });
  return ban;
}

export async function revokeBan(banId: string, actor: { id: string }) {
  const ban = await prisma.ban.update({ where: { id: banId }, data: { revokedAt: new Date() } });
  await recomputeUserTables(ban.userId);
  await logAudit({ actorId: actor.id, action: "ban.revoke", entityType: "User", entityId: ban.userId, meta: { banId } });
}

export const adjustInput = z.object({
  amount: z.coerce
    .number()
    .int("Debe ser un número entero.")
    .refine((n) => n !== 0, "El monto no puede ser 0.")
    .refine((n) => Math.abs(n) <= 1_000_000, "Monto demasiado grande."),
  reason: z.string().trim().min(5, "El motivo es obligatorio (mínimo 5 caracteres).").max(300),
});

/** Ajuste manual de créditos por el admin: motivo obligatorio y auditoría. */
export async function adjustCredits(userId: string, raw: unknown, actor: { id: string }) {
  const input = adjustInput.parse(raw);
  const tx = await postTransaction({
    userId,
    amount: input.amount,
    type: "ADMIN_ADJUSTMENT",
    reason: input.reason,
    idempotencyKey: `adjust:${userId}:${crypto.randomUUID()}`,
    createdById: actor.id,
  });
  await logAudit({ actorId: actor.id, action: "credits.adjust", entityType: "User", entityId: userId, after: input, meta: { txId: tx.id } });
  return tx;
}
