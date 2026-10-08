import { z } from "zod";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { slugify } from "@/lib/text";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { getActiveBan } from "@/server/users/bans";
import { postTransaction } from "@/server/credits/service";
import { recomputeTournamentStandings } from "@/server/ranking/service";
import { finalizeAttempt } from "@/server/game/engine";
import { getSettings } from "@/server/config/service";
import { logger } from "@/server/logger";

const DAY = 86_400_000;

export const WILDCARD_TYPES = ["DOUBLE_TOTAL", "DOUBLE_PER_CORRECT", "TRIPLE_SURPRISE"] as const;

export const tournamentInput = z
  .object({
    name: z.string().trim().min(3, "Mínimo 3 caracteres.").max(80),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]*$/, "Solo minúsculas, números y guiones.")
      .max(60)
      .optional(),
    description: z.string().trim().max(3000).optional(),
    imageKey: z.string().trim().max(300).optional(),
    categoryIds: z.array(z.string()).min(1, "Elegí al menos una categoría."),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    registrationOpensAt: z.coerce.date(),
    registrationEndsAt: z.coerce.date(),
    quizCount: z.coerce.number().int().min(1).max(100),
    frequencyDays: z.coerce.number().int().min(1).max(60),
    entryCost: z.coerce.number().int().min(0).max(1_000_000),
    maxParticipants: z.coerce.number().int().min(2).max(1_000_000).nullable(),
    wildcardsPerQuiz: z.coerce.number().int().min(0).max(3),
    wildcards: z.array(z.object({ type: z.enum(WILDCARD_TYPES), quantity: z.coerce.number().int().min(0).max(50) })),
    prizes: z.array(z.object({ rank: z.coerce.number().int().min(1), credits: z.coerce.number().int().min(1).max(1_000_000) })).max(20),
    scoring: z.object({
      base: z.coerce.number().int().min(0).max(10000),
      timeBonus: z.coerce.number().int().min(0).max(10000),
      wrongPenalty: z.coerce.number().int().min(0).max(10000),
    }),
  })
  .superRefine((t, ctx) => {
    if (!(t.startsAt < t.endsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "El torneo debe terminar después de empezar." });
    if (!(t.registrationOpensAt < t.registrationEndsAt))
      ctx.addIssue({ code: "custom", path: ["registrationEndsAt"], message: "La inscripción debe cerrar después de abrir." });
    if (t.registrationEndsAt > t.endsAt)
      ctx.addIssue({ code: "custom", path: ["registrationEndsAt"], message: "La inscripción no puede cerrar después del fin del torneo." });
    const ranks = t.prizes.map((p) => p.rank);
    if (new Set(ranks).size !== ranks.length) ctx.addIssue({ code: "custom", path: ["prizes"], message: "Hay puestos de premio repetidos." });
  });

export type TournamentInput = z.infer<typeof tournamentInput>;

export async function saveTournament(id: string | null, raw: unknown, actor: { id: string }) {
  const input = tournamentInput.parse(raw);
  const slug = input.slug || slugify(input.name);
  if (await prisma.tournament.findFirst({ where: { slug, NOT: id ? { id } : undefined } }))
    throw new UserError("Ya existe un torneo con ese identificador.");
  const before = id ? await prisma.tournament.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } }) : null;
  if (id && !before) throw new NotFoundError("Torneo");
  if (before && (before.status === "FINISHED" || before.status === "CANCELLED")) throw new UserError("El torneo ya terminó o fue cancelado.");
  if (before && before._count.entries > 0 && before.entryCost !== input.entryCost)
    throw new UserError("No se puede cambiar el costo cuando ya hay inscriptos.");
  if (id) {
    const outside = await prisma.quiz.count({
      where: { tournamentId: id, OR: [{ opensAt: { lt: input.startsAt } }, { closesAt: { gt: input.endsAt } }] },
    });
    if (outside) throw new UserError(`Hay ${outside} cuestionario(s) del torneo fuera de las nuevas fechas. Ajustalos primero.`);
  }
  const data = {
    name: input.name,
    slug,
    description: input.description || null,
    imageKey: input.imageKey || null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    registrationOpensAt: input.registrationOpensAt,
    registrationEndsAt: input.registrationEndsAt,
    quizCount: input.quizCount,
    frequencyDays: input.frequencyDays,
    entryCost: input.entryCost,
    maxParticipants: input.maxParticipants,
    wildcardsPerQuiz: input.wildcardsPerQuiz,
    prizes: input.prizes.sort((a, b) => a.rank - b.rank),
    scoring: input.scoring,
  };
  const t = await prisma.$transaction(async (tx) => {
    const saved = id ? await tx.tournament.update({ where: { id }, data }) : await tx.tournament.create({ data: { ...data, createdById: actor.id } });
    await tx.tournamentCategory.deleteMany({ where: { tournamentId: saved.id } });
    await tx.tournamentCategory.createMany({ data: input.categoryIds.map((categoryId) => ({ tournamentId: saved.id, categoryId })) });
    await tx.tournamentWildcard.deleteMany({ where: { tournamentId: saved.id } });
    const wc = input.wildcards.filter((w) => w.quantity > 0);
    if (wc.length) await tx.tournamentWildcard.createMany({ data: wc.map((w) => ({ tournamentId: saved.id, ...w })) });
    return saved;
  });
  await logAudit({ actorId: actor.id, action: id ? "tournament.update" : "tournament.create", entityType: "Tournament", entityId: t.id, before });
  return t;
}

export async function publishTournament(id: string, actor: { id: string }) {
  const t = await prisma.tournament.findUnique({ where: { id }, include: { _count: { select: { quizzes: true } } } });
  if (!t) throw new NotFoundError("Torneo");
  if (t.status !== "DRAFT") throw new UserError("Solo se publica un torneo en borrador.");
  await prisma.tournament.update({ where: { id }, data: { status: "PUBLISHED" } });
  await logAudit({ actorId: actor.id, action: "tournament.publish", entityType: "Tournament", entityId: id });
}

/** Crea los cuestionarios del torneo como borradores, espaciados según la frecuencia y dentro de la vigencia. */
export async function generateTournamentQuizzes(id: string, actor: { id: string }) {
  const t = await prisma.tournament.findUnique({ where: { id }, include: { _count: { select: { quizzes: true } } } });
  if (!t) throw new NotFoundError("Torneo");
  const s = await getSettings();
  const missing = t.quizCount - t._count.quizzes;
  if (missing <= 0) throw new UserError("El torneo ya tiene todos sus cuestionarios.");
  const activeMs = Math.min(s["quiz.activeDays"], t.frequencyDays) * DAY;
  const created = [];
  for (let i = t._count.quizzes; i < t.quizCount; i++) {
    const opensAt = new Date(t.startsAt.getTime() + i * t.frequencyDays * DAY);
    const closesAt = new Date(Math.min(opensAt.getTime() + activeMs, t.endsAt.getTime()));
    if (opensAt >= t.endsAt || closesAt <= opensAt) break;
    created.push(
      await prisma.quiz.create({
        data: {
          title: `${t.name} — Fecha ${i + 1}`,
          tournamentId: t.id,
          opensAt,
          closesAt,
          expiresAt: t.endsAt,
          timeLimitSec: s["quiz.timeLimitSec"],
          scoring: t.scoring as Prisma.InputJsonValue,
          createdById: actor.id,
        },
      }),
    );
  }
  await logAudit({ actorId: actor.id, action: "tournament.generateQuizzes", entityType: "Tournament", entityId: id, meta: { created: created.length } });
  return created.length;
}

// ───────────────────────── Inscripción ─────────────────────────

export function registrationState(t: { status: string; registrationOpensAt: Date; registrationEndsAt: Date }, now = new Date()) {
  if (t.status !== "PUBLISHED") return "CLOSED" as const;
  if (now < t.registrationOpensAt) return "NOT_YET" as const;
  if (now >= t.registrationEndsAt) return "CLOSED" as const;
  return "OPEN" as const;
}

/** Inscribe al usuario cobrando los créditos. Atómico: cupo y cobro en la misma transacción. */
export async function enrollInTournament(userId: string, tournamentId: string, now = new Date()) {
  if (await getActiveBan(userId, now)) throw new UserError("Tu cuenta está suspendida: no podés inscribirte.");
  return prisma.$transaction(async (tx) => {
    // Lock del torneo: serializa inscripciones para respetar el cupo.
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
    const t = await tx.tournament.findUnique({ where: { id: tournamentId }, include: { _count: { select: { entries: true } } } });
    if (!t) throw new NotFoundError("Torneo");
    const reg = registrationState(t, now);
    if (reg === "NOT_YET") throw new UserError("La inscripción todavía no abrió.");
    if (reg === "CLOSED") throw new UserError("La inscripción está cerrada.");
    if (await tx.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } }))
      throw new UserError("Ya estás inscripto en este torneo.");
    if (t.maxParticipants && t._count.entries >= t.maxParticipants) throw new UserError("El torneo ya completó su cupo.");
    const ledger =
      t.entryCost > 0
        ? await postTransaction(
            {
              userId,
              amount: -t.entryCost,
              type: "TOURNAMENT_ENTRY",
              reason: `Inscripción: ${t.name}`,
              idempotencyKey: `entry:${tournamentId}:${userId}`,
              meta: { tournamentId },
            },
            tx,
          )
        : null;
    return tx.tournamentEntry.create({ data: { tournamentId, userId, enrolledAt: now, ledgerTxId: ledger?.id } });
  });
}

/** Cancela el torneo y devuelve la inscripción a cada participante. */
export async function cancelTournament(id: string, reason: string, actor: { id: string }) {
  if (!reason.trim()) throw new UserError("Indicá el motivo de la cancelación.");
  const t = await prisma.tournament.findUnique({ where: { id }, include: { entries: true } });
  if (!t) throw new NotFoundError("Torneo");
  if (t.status === "CANCELLED" || t.status === "FINISHED") throw new UserError("El torneo ya terminó o fue cancelado.");
  let refunded = 0;
  for (const e of t.entries) {
    if (t.entryCost > 0 && e.ledgerTxId) {
      await postTransaction({
        userId: e.userId,
        amount: t.entryCost,
        type: "TOURNAMENT_REFUND",
        reason: `Reembolso: se canceló ${t.name}`,
        idempotencyKey: `refund:${id}:${e.userId}`,
        createdById: actor.id,
        meta: { tournamentId: id },
      });
      refunded++;
    }
  }
  await prisma.tournament.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  // Los cuestionarios del torneo que no abrieron vuelven a borrador
  await prisma.quiz.updateMany({ where: { tournamentId: id, opensAt: { gt: new Date() } }, data: { publishedAt: null, status: "DRAFT" } });
  await logAudit({ actorId: actor.id, action: "tournament.cancel", entityType: "Tournament", entityId: id, meta: { reason, refunded } });
  return refunded;
}

// ───────────────────────── Cierre y premios ─────────────────────────

/** Cierra un torneo vencido: tabla final y premios a los primeros puestos (empates cobran el premio del puesto). */
export async function finishTournament(id: string, now = new Date()) {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t || t.status !== "PUBLISHED" || t.endsAt > now) return false;
  const open = await prisma.attempt.findMany({ where: { quiz: { tournamentId: id }, status: "IN_PROGRESS" }, select: { id: true } });
  for (const a of open) await finalizeAttempt(a.id, now);
  await recomputeTournamentStandings(id, now);
  const prizes = (t.prizes as { rank: number; credits: number }[]) ?? [];
  const standings = await prisma.tournamentStanding.findMany({ where: { tournamentId: id } });
  for (const p of prizes) {
    for (const st of standings.filter((s) => s.rank === p.rank)) {
      await postTransaction({
        userId: st.userId,
        amount: p.credits,
        type: "TOURNAMENT_PRIZE",
        reason: `Premio: puesto ${p.rank} en ${t.name}`,
        idempotencyKey: `prize:${id}:${st.userId}`,
        meta: { tournamentId: id, rank: p.rank },
      });
    }
  }
  await prisma.tournament.update({ where: { id }, data: { status: "FINISHED", finishedAt: now } });
  await logAudit({ actorId: null, action: "tournament.finish", entityType: "Tournament", entityId: id, meta: { participants: standings.length } });
  logger.info({ tournamentId: id }, "torneo finalizado");
  return true;
}

export async function finishDueTournaments(now = new Date()) {
  const due = await prisma.tournament.findMany({ where: { status: "PUBLISHED", endsAt: { lte: now } }, select: { id: true } });
  let n = 0;
  for (const t of due) if (await finishTournament(t.id, now)) n++;
  return n;
}
