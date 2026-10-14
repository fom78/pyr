import { prisma, type Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { slugify } from "@/lib/text";
import { DEFAULT_TZ, formatDateTime } from "@/lib/format";
import { logAudit } from "@/server/audit";
import { logger } from "@/server/logger";
import { activeBanWhere } from "@/server/users/bans";
import { notifyStaff, notifyUsers } from "@/server/notifications/service";
import { addLocalDays } from "@/server/autoquiz/slots";
import { tournamentTimeline } from "./timeline";
import { editionName } from "./service";

async function uniqueSlug(base: string, db: Db) {
  let slug = base;
  for (let i = 2; await db.tournament.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return slug;
}

/**
 * Torneos recurrentes (tarea `tournaments-series`, cada hora): cuando empieza una edición con
 * `repeatEveryDays`, se crea la siguiente con la misma configuración, `repeatEveryDays` días después
 * (misma hora local). Queda publicada: la inscripción abre sola según `registrationLeadDays`.
 * Una sola vez por edición (`nextCreatedAt`).
 */
export async function createNextEditions(now = new Date(), db: Db = prisma) {
  const due = await db.tournament.findMany({
    where: { status: "PUBLISHED", repeatEveryDays: { not: null }, nextCreatedAt: null, startsAt: { lte: now } },
    include: { categories: true, wildcards: true },
  });
  let created = 0;
  for (const t of due) {
    // Reclamo atómico: si dos corridas se cruzan, solo una crea la edición.
    const claimed = await db.tournament.updateMany({ where: { id: t.id, nextCreatedAt: null }, data: { nextCreatedAt: now } });
    if (!claimed.count) continue;
    const seriesId = t.seriesId ?? t.id;
    const seriesName = t.seriesName ?? t.name;
    const edition = t.edition + 1;
    const startsAt = addLocalDays(t.startsAt, t.repeatEveryDays!, DEFAULT_TZ);
    const timeline = tournamentTimeline({ ...t, startsAt }, now);
    const next = await db.tournament.create({
      data: {
        name: editionName(seriesName, edition),
        slug: await uniqueSlug(`${slugify(seriesName)}-${edition}`, db),
        description: t.description,
        imageKey: t.imageKey,
        status: "PUBLISHED",
        startsAt,
        endsAt: timeline.endsAt,
        registrationOpensAt: timeline.registrationOpensAt,
        registrationEndsAt: timeline.registrationEndsAt,
        quizCount: t.quizCount,
        frequencyHours: t.frequencyHours,
        quizActiveHours: t.quizActiveHours,
        registrationLeadDays: t.registrationLeadDays,
        lateEntryDays: t.lateEntryDays,
        questionsPerQuiz: t.questionsPerQuiz,
        autoQuizzes: t.autoQuizzes,
        repeatEveryDays: t.repeatEveryDays,
        seriesId,
        seriesName,
        edition,
        entryCost: t.entryCost,
        maxParticipants: t.maxParticipants,
        wildcardsPerQuiz: t.wildcardsPerQuiz,
        scoring: t.scoring as Prisma.InputJsonValue,
        prizes: t.prizes as Prisma.InputJsonValue,
        createdById: t.createdById,
        categories: { create: t.categories.map((c) => ({ categoryId: c.categoryId })) },
        wildcards: { create: t.wildcards.map((w) => ({ type: w.type, quantity: w.quantity })) },
      },
    });
    // La primera edición pasa a ser la cabeza de la serie.
    if (!t.seriesId) await db.tournament.update({ where: { id: t.id }, data: { seriesId, seriesName } });
    created++;
    await logAudit({ actorId: null, action: "tournament.nextEdition", entityType: "Tournament", entityId: next.id, meta: { from: t.id, edition } }, db);
    await notifyStaff(
      {
        level: "INFO",
        kind: "tournament.nextEdition",
        title: `Se creó ${next.name}`,
        body: `Empieza el ${formatDateTime(startsAt)}; la inscripción abre el ${formatDateTime(timeline.registrationOpensAt)}. Revisalo o cancelalo si no va.`,
        href: `/admin/torneos/${next.id}`,
        dedupeKey: `tournament.nextEdition:${next.id}`,
      },
      now,
      db,
    );
  }
  if (created) logger.info({ created }, "ediciones de torneos creadas");
  return { created };
}

/**
 * Cuando abre la inscripción de una edición nueva, avisa a quienes jugaron la anterior (y todavía no
 * se anotaron). Se deduplica por torneo y usuario.
 */
export async function notifySeriesRegistration(now = new Date(), db: Db = prisma) {
  const open = await db.tournament.findMany({
    where: { status: "PUBLISHED", edition: { gt: 1 }, seriesId: { not: null }, registrationOpensAt: { lte: now }, registrationEndsAt: { gt: now } },
    select: { id: true, name: true, slug: true, seriesId: true, edition: true, startsAt: true, entryCost: true },
  });
  let sent = 0;
  for (const t of open) {
    const prev = await db.tournament.findFirst({
      where: { OR: [{ id: t.seriesId! }, { seriesId: t.seriesId }], edition: t.edition - 1 },
      select: { id: true },
    });
    if (!prev) continue;
    const players = await db.tournamentEntry.findMany({
      where: {
        tournamentId: prev.id,
        user: { bans: { none: activeBanWhere(now) }, tournamentEntries: { none: { tournamentId: t.id } } },
      },
      select: { userId: true },
    });
    sent += await notifyUsers(
      players.map((p) => p.userId),
      {
        level: "INFO",
        kind: "tournament.registrationOpen",
        title: `🏆 Abrió la inscripción: ${t.name}`,
        body: `Empieza el ${formatDateTime(t.startsAt)}${t.entryCost ? ` · inscripción ${t.entryCost} créditos` : " · gratis"}. Jugaste la edición anterior: ¿vas por la revancha?`,
        href: `/torneos/${t.slug}`,
        dedupeKey: `tournament.registrationOpen:${t.id}`,
      },
      db,
    );
  }
  return { sent };
}
