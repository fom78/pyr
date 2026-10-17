import { z } from "zod";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { slugify } from "@/lib/text";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { getActiveBan } from "@/server/users/bans";
import { postTransaction } from "@/server/credits/service";
import { postInventory } from "@/server/inventory/service";
import { parsePrizes, prizeText } from "./prizes";
import { recomputeTournamentStandings } from "@/server/ranking/service";
import { finalizeAttempt } from "@/server/game/engine";
import { getSettings } from "@/server/config/service";
import { logger } from "@/server/logger";
import { notifyUsers } from "@/server/notifications/service";
import { DEFAULT_TZ, formatNumber, fromDateTimeInput, toDateTimeInput } from "@/lib/format";
import { addLocalDays } from "@/server/autoquiz/slots";
import { tournamentTimeline, timelineIssues } from "./timeline";
import { isBracketSize, roundsFor } from "./bracket";
import { applyQualifiers, knockoutCapacity, knockoutFinalRows } from "./knockout";

const HOUR = 3_600_000;

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
    startsAt: z.coerce.date({ error: "Elegí cuándo empieza." }),
    quizCount: z.coerce.number().int().min(1, "Al menos 1 cuestionario.").max(100),
    frequencyHours: z.coerce.number().int().min(1, "Mínimo 1 hora.").max(24 * 30, "Máximo 30 días (720 h)."),
    quizActiveHours: z.coerce.number().int().min(1, "Mínimo 1 hora.").max(24 * 7, "Máximo 7 días (168 h)."),
    registrationLeadDays: z.coerce.number().int().min(0).max(60),
    lateEntryDays: z.coerce.number().int().min(0).max(60),
    questionsPerQuiz: z.coerce.number().int().min(1).max(100),
    autoQuizzes: z.boolean(),
    repeatEveryDays: z.coerce.number().int().min(1, "Mínimo 1 día.").max(365).nullable(),
    entryCost: z.coerce.number().int().min(0).max(1_000_000),
    maxParticipants: z.coerce.number().int().min(2).max(1_000_000).nullable(),
    wildcardsPerQuiz: z.coerce.number().int().min(0).max(3),
    wildcards: z.array(z.object({ type: z.enum(WILDCARD_TYPES), quantity: z.coerce.number().int().min(0).max(50) })),
    prizes: z
      .array(
        z
          .object({
            rank: z.coerce.number().int().min(1),
            credits: z.coerce.number({ error: "Premio inválido." }).int("Los premios son números enteros.").min(0, "Premio inválido.").max(1_000_000),
            stars: z.coerce.number({ error: "Premio inválido." }).int("Los premios son números enteros.").min(0, "Premio inválido.").max(10_000).default(0),
          })
          .refine((p) => p.credits > 0 || p.stars > 0, "Cada puesto premiado tiene que dar créditos o estrellas."),
      )
      .max(20),
    scoring: z.object({
      base: z.coerce.number().int().min(0).max(10000),
      timeBonus: z.coerce.number().int().min(0).max(10000),
      wrongPenalty: z.coerce.number().int().min(0).max(10000),
    }),
    format: z.enum(["POINTS", "KNOCKOUT"]).default("POINTS"),
    seeding: z.enum(["QUALIFICATION", "RANDOM"]).default("QUALIFICATION"),
    autoConfirmQualified: z.boolean().default(true),
    thirdPlaceMatch: z.boolean().default(false),
    questionSource: z.enum(["NEW_FIRST", "REUSED_FIRST"]).default("NEW_FIRST"),
    uniqueQuestions: z.coerce.number().int().min(1, "Al menos 1 pregunta propia por partido.").max(100).nullable().default(null),
    qualifiers: z
      .array(z.object({ sourceTournamentId: z.string().min(1), topN: z.coerce.number().int().min(1, "Mínimo 1 clasificado.").max(256) }))
      .max(10)
      .default([]),
  })
  .transform((t) =>
    // Eliminatoria: cada ronda es un "cuestionario" que dura frequencyHours; la inscripción cierra al empezar.
    t.format === "KNOCKOUT" && t.maxParticipants && isBracketSize(t.maxParticipants)
      ? { ...t, quizCount: roundsFor(t.maxParticipants), quizActiveHours: t.frequencyHours, lateEntryDays: 0, autoQuizzes: false, repeatEveryDays: null }
      : t,
  )
  .superRefine((t, ctx) => {
    if (t.format === "KNOCKOUT") {
      if (!t.maxParticipants || !isBracketSize(t.maxParticipants))
        ctx.addIssue({ code: "custom", path: ["maxParticipants"], message: "El cuadro tiene que ser de 4, 8, 16, 32, 64, 128 o 256 jugadores." });
      const reserved = t.qualifiers.reduce((a, q) => a + q.topN, 0);
      if (t.maxParticipants && reserved > t.maxParticipants)
        ctx.addIssue({ code: "custom", path: ["qualifiers"], message: `Los clasificatorios reservan ${reserved} lugares y el cuadro es de ${t.maxParticipants}.` });
      if (t.uniqueQuestions != null && t.uniqueQuestions > t.questionsPerQuiz)
        ctx.addIssue({ code: "custom", path: ["uniqueQuestions"], message: "No pueden ser más que las preguntas por partido." });
      const ids = t.qualifiers.map((q) => q.sourceTournamentId);
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["qualifiers"], message: "Hay torneos clasificatorios repetidos." });
    } else if (t.qualifiers.length) ctx.addIssue({ code: "custom", path: ["qualifiers"], message: "Solo las eliminatorias tienen clasificatorios." });
    for (const i of timelineIssues(t)) ctx.addIssue({ code: "custom", path: [i.field], message: i.message });
    const ranks = t.prizes.map((p) => p.rank);
    if (new Set(ranks).size !== ranks.length) ctx.addIssue({ code: "custom", path: ["prizes"], message: "Hay puestos de premio repetidos." });
  });

export type TournamentInput = z.infer<typeof tournamentInput>;

/** Campos que cambian el calendario del torneo (no se pueden tocar una vez que empezó). */
const TIMING_KEYS = ["quizCount", "frequencyHours", "quizActiveHours", "registrationLeadDays", "lateEntryDays"] as const;

/** Nombre de una edición de una serie: "Torneo semanal #3". */
export function editionName(base: string, edition: number) {
  return edition > 1 ? `${base} #${edition}` : base;
}

export async function saveTournament(id: string | null, raw: unknown, actor: { id: string }, now = new Date()) {
  const input = tournamentInput.parse(raw);
  const slug = input.slug || slugify(input.name);
  if (await prisma.tournament.findFirst({ where: { slug, NOT: id ? { id } : undefined } }))
    throw new UserError("Ya existe un torneo con ese identificador.");
  const before = id ? await prisma.tournament.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } }) : null;
  if (id && !before) throw new NotFoundError("Torneo");
  if (before && (before.status === "FINISHED" || before.status === "CANCELLED")) throw new UserError("El torneo ya terminó o fue cancelado.");
  if (before && before.status !== "DRAFT" && before.format !== input.format) throw new UserError("El formato solo se cambia mientras el torneo es borrador.");
  for (const q of input.qualifiers) {
    const src = await prisma.tournament.findUnique({ where: { id: q.sourceTournamentId } });
    if (!src || src.id === id) throw new UserError("Un torneo clasificatorio no existe o es este mismo.");
    if (src.endsAt > input.startsAt) throw new UserError(`"${src.name}" termina después de que empieza esta eliminatoria: sus clasificados no llegarían.`);
  }
  if (before && before._count.entries > 0 && before.entryCost !== input.entryCost)
    throw new UserError("No se puede cambiar el costo cuando ya hay inscriptos.");
  if (before && before.startsAt <= now) {
    const moved = before.startsAt.getTime() !== input.startsAt.getTime();
    if (moved || TIMING_KEYS.some((k) => before[k] !== input[k]))
      throw new UserError("El torneo ya empezó: no se pueden cambiar sus tiempos ni la cantidad de cuestionarios.");
  }
  const timeline = tournamentTimeline(input, now);
  const data = {
    name: input.name,
    slug,
    description: input.description || null,
    imageKey: input.imageKey || null,
    startsAt: input.startsAt,
    endsAt: timeline.endsAt,
    // Al editar con anticipación 0 se mantiene la apertura original (si no, se correría a "ahora").
    registrationOpensAt:
      before && input.registrationLeadDays === 0 && before.registrationOpensAt < timeline.registrationOpensAt
        ? before.registrationOpensAt
        : timeline.registrationOpensAt,
    registrationEndsAt: timeline.registrationEndsAt,
    quizCount: input.quizCount,
    frequencyHours: input.frequencyHours,
    quizActiveHours: input.quizActiveHours,
    registrationLeadDays: input.registrationLeadDays,
    lateEntryDays: input.lateEntryDays,
    questionsPerQuiz: input.questionsPerQuiz,
    autoQuizzes: input.autoQuizzes,
    repeatEveryDays: input.repeatEveryDays,
    // Una edición de una serie conserva el nombre base de la serie (el "#n" lo agrega `editionName`).
    seriesName: before && before.edition > 1 ? before.seriesName : input.name,
    entryCost: input.entryCost,
    maxParticipants: input.maxParticipants,
    wildcardsPerQuiz: input.wildcardsPerQuiz,
    prizes: input.prizes.sort((a, b) => a.rank - b.rank),
    scoring: input.scoring,
    format: input.format,
    seeding: input.seeding,
    autoConfirmQualified: input.autoConfirmQualified,
    thirdPlaceMatch: input.thirdPlaceMatch,
    questionSource: input.questionSource,
    uniqueQuestions: input.uniqueQuestions != null && input.uniqueQuestions < input.questionsPerQuiz ? input.uniqueQuestions : null,
  };
  const t = await prisma.$transaction(async (tx) => {
    const saved = id ? await tx.tournament.update({ where: { id }, data }) : await tx.tournament.create({ data: { ...data, createdById: actor.id } });
    await tx.tournamentCategory.deleteMany({ where: { tournamentId: saved.id } });
    await tx.tournamentCategory.createMany({ data: input.categoryIds.map((categoryId) => ({ tournamentId: saved.id, categoryId })) });
    await tx.tournamentWildcard.deleteMany({ where: { tournamentId: saved.id } });
    const wc = input.wildcards.filter((w) => w.quantity > 0);
    if (wc.length) await tx.tournamentWildcard.createMany({ data: wc.map((w) => ({ tournamentId: saved.id, ...w })) });
    // Clasificatorios: se reemplazan los que todavía no se aplicaron (los aplicados ya inscribieron gente).
    const applied = await tx.tournamentQualifier.findMany({ where: { tournamentId: saved.id, appliedAt: { not: null } } });
    await tx.tournamentQualifier.deleteMany({ where: { tournamentId: saved.id, appliedAt: null } });
    const fresh = input.qualifiers.filter((q) => !applied.some((a) => a.sourceTournamentId === q.sourceTournamentId));
    if (fresh.length) await tx.tournamentQualifier.createMany({ data: fresh.map((q) => ({ tournamentId: saved.id, ...q })) });
    // Cambió el calendario (o se apagó lo automático): los borradores automáticos que ya no coinciden
    // se descartan (sus preguntas vuelven al banco) y el generador arma los nuevos.
    if (before) {
      const keep = new Set(timeline.slots.map((d) => d.getTime()));
      const drafts = await tx.quiz.findMany({
        where: { tournamentId: saved.id, slotAt: { not: null }, createdById: null, publishedAt: null },
        select: { id: true, slotAt: true },
      });
      const stale = drafts.filter((q) => !input.autoQuizzes || !keep.has(q.slotAt!.getTime())).map((q) => q.id);
      if (stale.length) await tx.quiz.deleteMany({ where: { id: { in: stale } } });
    }
    return saved;
  });
  await logAudit({ actorId: actor.id, action: id ? "tournament.update" : "tournament.create", entityType: "Tournament", entityId: t.id, before });
  return t;
}

export async function publishTournament(id: string, actor: { id: string }) {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Torneo");
  if (t.status !== "DRAFT") throw new UserError("Solo se publica un torneo en borrador.");
  await prisma.tournament.update({ where: { id }, data: { status: "PUBLISHED" } });
  await logAudit({ actorId: actor.id, action: "tournament.publish", entityType: "Tournament", entityId: id });
}

/** "Dejar de repetir": esta edición no crea la siguiente. */
export async function stopRepeating(id: string, actor: { id: string }) {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) throw new NotFoundError("Torneo");
  if (!t.repeatEveryDays) throw new UserError("Este torneo no se repite.");
  await prisma.tournament.update({ where: { id }, data: { repeatEveryDays: null } });
  await logAudit({ actorId: actor.id, action: "tournament.stopRepeating", entityType: "Tournament", entityId: id });
}

/** Torneo sin cuestionarios automáticos: crea vacíos los que faltan (para cargar a mano), uno por turno. */
export async function generateTournamentQuizzes(id: string, actor: { id: string }, now = new Date()) {
  const t = await prisma.tournament.findUnique({ where: { id }, include: { quizzes: { select: { opensAt: true } } } });
  if (!t) throw new NotFoundError("Torneo");
  if (t.autoQuizzes) throw new UserError("Este torneo arma sus cuestionarios solo con el banco de sus categorías.");
  const s = await getSettings();
  const taken = new Set(t.quizzes.map((q) => q.opensAt.getTime()));
  const slots = tournamentTimeline(t, now).slots.filter((d) => !taken.has(d.getTime()));
  if (!slots.length) throw new UserError("El torneo ya tiene todos sus cuestionarios.");
  for (const [i, opensAt] of slots.entries()) {
    await prisma.quiz.create({
      data: {
        title: `${t.name} — Fecha ${t.quizzes.length + i + 1}`,
        tournamentId: t.id,
        opensAt,
        closesAt: new Date(Math.min(opensAt.getTime() + t.quizActiveHours * HOUR, t.endsAt.getTime())),
        expiresAt: t.endsAt,
        timeLimitSec: s["quiz.timeLimitSec"],
        scoring: t.scoring as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });
  }
  await logAudit({ actorId: actor.id, action: "tournament.generateQuizzes", entityType: "Tournament", entityId: id, meta: { created: slots.length } });
  return slots.length;
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
    if (t.format === "KNOCKOUT") {
      const cap = await knockoutCapacity(tournamentId, tx);
      if (cap.open <= 0)
        throw new UserError(cap.reserved ? "No quedan lugares abiertos: los que faltan están reservados para clasificados." : "El torneo ya completó su cupo.");
    } else if (t.maxParticipants && t._count.entries >= t.maxParticipants) throw new UserError("El torneo ya completó su cupo.");
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
    return tx.tournamentEntry.create({ data: { tournamentId, userId, enrolledAt: now, confirmedAt: now, ledgerTxId: ledger?.id } });
  });
}

/** Cancela el torneo y devuelve la inscripción a cada participante. */
export async function cancelTournament(id: string, reason: string, actor: { id: string | null }) {
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

/**
 * Cierra un torneo vencido: tabla final, premios a los primeros puestos (empates cobran el premio del
 * puesto), foto permanente de resultados (`TournamentResult`, para el perfil) y aviso a cada participante.
 */
export async function finishTournament(id: string, now = new Date()) {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t || t.status !== "PUBLISHED") return false;
  // Eliminatoria: termina cuando se decide la final (los puestos salen del cuadro, no de la tabla).
  if (t.format === "KNOCKOUT") {
    const rows = await knockoutFinalRows(t);
    if (!rows) return false;
    return closeTournament(t, rows, now);
  }
  if (t.endsAt > now) return false;
  const open = await prisma.attempt.findMany({ where: { quiz: { tournamentId: id }, status: "IN_PROGRESS" }, select: { id: true } });
  for (const a of open) await finalizeAttempt(a.id, now);
  await recomputeTournamentStandings(id, now);
  const standings = await prisma.tournamentStanding.findMany({ where: { tournamentId: id } });
  const quizzesTotal = await prisma.quiz.count({ where: { tournamentId: id, publishedAt: { not: null } } });
  return closeTournament(
    t,
    standings.map((st) => ({
      userId: st.userId,
      rank: st.rank,
      points: st.points,
      quizzesPlayed: st.quizzesCounted,
      quizzesTotal,
      correctCount: st.correctCount,
    })),
    now,
  );
}

type FinalRow = { userId: string; rank: number; points: number; quizzesPlayed: number; quizzesTotal: number; correctCount: number };

/** Premios, foto de resultados (`TournamentResult`), estado FINISHED, avisos y clasificados a eliminatorias. */
async function closeTournament(t: { id: string; name: string; slug: string; prizes: Prisma.JsonValue }, rows: FinalRow[], now: Date) {
  const id = t.id;
  const prizes = parsePrizes(t.prizes);
  const prizeOf = new Map<string, { credits: number; stars: number }>();
  for (const p of prizes) {
    for (const st of rows.filter((s) => s.rank === p.rank)) {
      if (p.credits > 0)
        await postTransaction({
          userId: st.userId,
          amount: p.credits,
          type: "TOURNAMENT_PRIZE",
          reason: `Premio: puesto ${p.rank} en ${t.name}`,
          idempotencyKey: `prize:${id}:${st.userId}`,
          meta: { tournamentId: id, rank: p.rank },
        });
      if (p.stars > 0)
        await postInventory({
          userId: st.userId,
          asset: "STAR",
          amount: p.stars,
          type: "TOURNAMENT_PRIZE",
          reason: `Premio: puesto ${p.rank} en ${t.name}`,
          idempotencyKey: `prize-stars:${id}:${st.userId}`,
          meta: { tournamentId: id, rank: p.rank },
        });
      prizeOf.set(st.userId, { credits: p.credits, stars: p.stars });
    }
  }
  await prisma.$transaction([
    prisma.tournamentResult.deleteMany({ where: { tournamentId: id } }),
    prisma.tournamentResult.createMany({
      data: rows.map((st) => ({
        tournamentId: id,
        userId: st.userId,
        rank: st.rank,
        participants: rows.length,
        points: st.points,
        quizzesPlayed: st.quizzesPlayed,
        quizzesTotal: st.quizzesTotal,
        correctCount: st.correctCount,
        prizeCredits: prizeOf.get(st.userId)?.credits ?? 0,
        prizeStars: prizeOf.get(st.userId)?.stars ?? 0,
        tournamentName: t.name,
        finishedAt: now,
      })),
    }),
    prisma.tournament.update({ where: { id }, data: { status: "FINISHED", finishedAt: now } }),
  ]);
  const MEDAL = ["🥇", "🥈", "🥉"];
  for (const st of rows) {
    const prize = prizeOf.get(st.userId);
    await notifyUsers([st.userId], {
      level: "INFO",
      kind: "tournament.finished",
      title: `${st.rank <= 3 ? `${MEDAL[st.rank - 1]} ` : ""}Terminaste #${st.rank} de ${rows.length} en ${t.name}`,
      body: prize ? `Ganaste ${prizeText(prize)} de premio.` : `Sumaste ${formatNumber(st.points)} puntos.`,
      href: `/torneos/${t.slug}`,
      dedupeKey: `tournament.finished:${id}`,
    });
  }
  await logAudit({ actorId: null, action: "tournament.finish", entityType: "Tournament", entityId: id, meta: { participants: rows.length } });
  logger.info({ tournamentId: id }, "torneo finalizado");
  // Sus primeros puestos clasifican a las eliminatorias que lo usan de clasificatorio.
  try {
    await applyQualifiers(id, now);
  } catch (err) {
    logger.error({ err, tournamentId: id }, "error al inscribir clasificados");
  }
  return true;
}

export async function finishDueTournaments(now = new Date()) {
  const due = await prisma.tournament.findMany({ where: { status: "PUBLISHED", endsAt: { lte: now } }, select: { id: true } });
  let n = 0;
  for (const t of due) if (await finishTournament(t.id, now)) n++;
  return n;
}

/**
 * Valores sugeridos para un torneo nuevo: el "torneo semanal" (7 cuestionarios, uno por día abierto
 * 24 h, inscripción desde 3 días antes). Empieza en 3 días a las 20:00 (hora de Buenos Aires).
 */
export function suggestTournamentDefaults(now = new Date()) {
  const day = toDateTimeInput(addLocalDays(now, 3, DEFAULT_TZ), DEFAULT_TZ).slice(0, 10);
  return {
    startsAt: fromDateTimeInput(`${day}T20:00`, DEFAULT_TZ),
    quizCount: 7,
    frequencyHours: 24,
    quizActiveHours: 24,
    registrationLeadDays: 3,
    lateEntryDays: 0,
    questionsPerQuiz: 10,
  };
}

/** Torneos que todavía pueden dar clasificados a una eliminatoria (no terminaron ni se cancelaron). */
export async function qualifierSources(excludeId?: string) {
  return prisma.tournament.findMany({
    where: { status: { in: ["DRAFT", "PUBLISHED"] }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    orderBy: { startsAt: "asc" },
    select: { id: true, name: true },
  });
}
