import { z } from "zod";
import { prisma, type Db } from "@/server/db";
import { Prisma, type Category, type QuizSchedule } from "@/generated/prisma/client";
import { getCategorySettings } from "@/server/config/service";
import type { Settings } from "@/server/config/registry";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { logger } from "@/server/logger";
import { buildQuestionWhere } from "@/server/questions/service";
import { notifyStaff } from "@/server/notifications/service";
import { weekKey } from "@/server/notifications/weekly";
import { publishQuiz } from "@/server/quiz/service";
import { getQuizStatus } from "@/server/quiz/status";
import { DEFAULT_TZ, formatDate, formatDateTime, fromDateTimeInput } from "@/lib/format";
import { gridSlots, upcomingSlots } from "./slots";
import { mixTotal, pickQuestions, remainingMix, type DifficultyMix, type FreshCandidate, type ReusableCandidate } from "./pick";
import { projectCoverage, type Coverage } from "./coverage";
import { renderTitle } from "./title";

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Un cuestionario manual de la liga a menos de esto de un turno lo ocupa: no se genera borrador. */
const MANUAL_CLASH_MS = 6 * HOUR;

export const SYSTEM_ACTOR = { id: null } as const;

// ───────────────────────────── Calendario ─────────────────────────────

export const scheduleInput = z.object({
  enabled: z.boolean(),
  /** Primer turno, como datetime-local ("yyyy-MM-ddTHH:mm") en `timezone`. */
  anchorAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Elegí fecha y hora del primer turno."),
  frequencyHours: z.coerce
    .number()
    .int("La frecuencia va en horas enteras.")
    .min(1, "La frecuencia mínima es 1 hora.")
    .max(24 * 14, "La frecuencia máxima es de 14 días (336 h)."),
  excludedWeekdays: z
    .array(z.coerce.number().int().min(0).max(6))
    .refine((d) => new Set(d).size < 7, "No se pueden excluir todos los días."),
  timezone: z.string().trim().min(1).default(DEFAULT_TZ),
  titleTemplate: z.string().trim().min(2, "Poné una plantilla de título.").max(120),
  difficultyMix: z.record(z.string().regex(/^[1-5]$/), z.coerce.number().int().min(0).max(100)).nullable(),
  timeMode: z.enum(["PER_QUESTION", "TOTAL"]),
});

export type ScheduleInput = z.infer<typeof scheduleInput>;

async function settingsFor(category: Category, db: Db) {
  return getCategorySettings(category, db);
}

/**
 * Crea o actualiza el calendario de una categoría. Los borradores automáticos que ya no caen en un
 * turno del calendario nuevo (o todos, si se deshabilita) se descartan y sus preguntas vuelven al banco.
 */
export async function saveSchedule(categoryId: string, raw: unknown, actor: { id: string }, now = new Date(), db: Db = prisma) {
  const input = scheduleInput.parse(raw);
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new NotFoundError("Categoría");
  const s = await settingsFor(category, db);
  const mix = input.difficultyMix && mixTotal(input.difficultyMix) > 0 ? input.difficultyMix : null;
  if (mixTotal(mix) > s["quiz.questionCount"])
    throw new UserError(`La mezcla de dificultad suma más que las ${s["quiz.questionCount"]} preguntas por cuestionario.`);
  const data = {
    enabled: input.enabled,
    anchorAt: fromDateTimeInput(input.anchorAt, input.timezone),
    frequencyHours: input.frequencyHours,
    excludedWeekdays: [...new Set(input.excludedWeekdays)].sort(),
    timezone: input.timezone,
    titleTemplate: input.titleTemplate,
    difficultyMix: mix ?? Prisma.DbNull,
    timeMode: input.timeMode,
  };
  const before = await db.quizSchedule.findUnique({ where: { categoryId } });
  const schedule = await db.quizSchedule.upsert({ where: { categoryId }, create: { categoryId, ...data }, update: data });

  const drafts = await db.quiz.findMany({ where: { scheduleId: schedule.id, publishedAt: null, slotAt: { gt: now } } });
  const valid = new Set(
    schedule.enabled ? upcomingSlots(schedule, now, new Date(now.getTime() + 366 * DAY)).map((d) => d.getTime()) : [],
  );
  const stale = drafts.filter((q) => !valid.has(q.slotAt!.getTime()));
  // Los automáticos se descartan; los manuales asignados a un turno quedan como borradores sueltos.
  const staleAuto = stale.filter((q) => !q.createdById).map((q) => q.id);
  const staleManual = stale.filter((q) => q.createdById).map((q) => q.id);
  if (staleAuto.length) await db.quiz.deleteMany({ where: { id: { in: staleAuto } } });
  if (staleManual.length) await db.quiz.updateMany({ where: { id: { in: staleManual } }, data: { scheduleId: null, slotAt: null } });

  await logAudit(
    {
      actorId: actor.id,
      action: before ? "schedule.update" : "schedule.create",
      entityType: "Category",
      entityId: categoryId,
      before,
      after: data,
      meta: stale.length ? { discardedDrafts: stale.length } : undefined,
    },
    db,
  );
  return { schedule, discarded: stale.length };
}

// ───────────────────────────── Candidatas ─────────────────────────────

/** Preguntas aprobadas de la categoría: nunca usadas y (si se permite) usadas hace más de `reuseAfterDays`. */
export async function loadCandidates(categoryId: string, s: Settings, now: Date, db: Db = prisma) {
  const freshRows = await db.question.findMany({
    where: buildQuestionWhere({ categoryId, status: "APPROVED", unused: "never" }, now),
    select: { id: true, difficulty: true, createdAt: true },
  });
  let reusable: ReusableCandidate[] = [];
  if (s["autoquiz.allowReuse"]) {
    const rows = await db.question.findMany({
      where: {
        ...buildQuestionWhere({ categoryId, status: "APPROVED", unused: s["autoquiz.reuseAfterDays"] }, now),
        AND: [{ quizQuestions: { some: {} } }],
      },
      select: {
        id: true,
        difficulty: true,
        quizQuestions: { select: { quiz: { select: { opensAt: true } } }, orderBy: { quiz: { opensAt: "desc" } }, take: 1 },
      },
    });
    reusable = rows.map((r) => ({ id: r.id, difficulty: r.difficulty, lastUsedAt: r.quizQuestions[0].quiz.opensAt }));
  }
  const fresh: FreshCandidate[] = freshRows;
  return { fresh, reusable };
}

function removePicked<T extends { id: string }>(list: T[], ids: Set<string>) {
  return list.filter((c) => !ids.has(c.id));
}

// ───────────────────────────── Generación ─────────────────────────────

type ScheduleWithCategory = QuizSchedule & { category: Category };

async function leagueQuizCount(categoryId: string, before: Date, db: Db) {
  return db.quiz.count({ where: { categoryId, tournamentId: null, opensAt: { lt: before } } });
}

/** Crea los borradores que falten para los turnos de un calendario. */
async function generateForSchedule(schedule: ScheduleWithCategory, now: Date, db: Db) {
  const s = await settingsFor(schedule.category, db);
  const from = new Date(now.getTime() + s["autoquiz.alertHours"] * HOUR);
  const until = new Date(now.getTime() + s["autoquiz.horizonDays"] * DAY);
  const missingSlots = await freeSlots(schedule, from, until, db);
  if (!missingSlots.length) return { created: 0, incomplete: 0 };

  let pools = await loadCandidates(schedule.categoryId, s, now, db);
  const count = s["quiz.questionCount"];
  const mix = schedule.difficultyMix as DifficultyMix | null;
  let created = 0;
  let incomplete = 0;
  for (const slotAt of missingSlots) {
    const { picks, missing } = pickQuestions(pools, count, mix, { allowReuse: s["autoquiz.allowReuse"] });
    const ids = new Set(picks.map((p) => p.id));
    pools = { fresh: removePicked(pools.fresh, ids), reusable: removePicked(pools.reusable, ids) };
    const quiz = await createSlotQuiz(schedule, slotAt, picks, s, db, { missing });
    if (!quiz) continue;
    created++;
    if (missing) incomplete++;
  }
  return { created, incomplete };
}

/**
 * Crea el cuestionario de un turno con las preguntas elegidas. Devuelve null si otra corrida
 * ya creó ese turno en paralelo (el índice único `[scheduleId, slotAt]` lo impide).
 */
async function createSlotQuiz(
  schedule: ScheduleWithCategory,
  slotAt: Date,
  picks: { id: string; reused: boolean }[],
  s: Settings,
  db: Db,
  meta: Record<string, unknown>,
) {
  const closesAt = new Date(slotAt.getTime() + s["quiz.activeHours"] * HOUR);
  const n = (await leagueQuizCount(schedule.categoryId, slotAt, db)) + 1;
  try {
    const quiz = await db.quiz.create({
      data: {
        title: renderTitle(schedule.titleTemplate, {
          categoria: schedule.category.name,
          fecha: formatDate(slotAt, schedule.timezone, "EEE d/M"),
          n,
        }),
        categoryId: schedule.categoryId,
        opensAt: slotAt,
        closesAt,
        expiresAt: new Date(closesAt.getTime() + s["quiz.computableDays"] * DAY),
        timeMode: schedule.timeMode,
        timeLimitSec: s["quiz.timeLimitSec"],
        scoring: { base: s["scoring.base"], timeBonus: s["scoring.timeBonus"], wrongPenalty: s["scoring.wrongPenalty"] },
        scheduleId: schedule.id,
        slotAt,
        questions: { create: picks.map((p, position) => ({ questionId: p.id, position, reused: p.reused })) },
      },
    });
    await logAudit(
      {
        actorId: null,
        action: "quiz.autoCreate",
        entityType: "Quiz",
        entityId: quiz.id,
        meta: { slotAt, reused: picks.filter((p) => p.reused).length, ...meta },
      },
      db,
    );
    return quiz;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}

/** Turnos de un calendario entre `from` y `until` que no tienen cuestionario (ni salteados ni excluidos). */
async function freeSlots(schedule: ScheduleWithCategory, from: Date, until: Date, db: Db) {
  const skipped = new Set(schedule.skippedSlots.map((d) => d.getTime()));
  const slots = upcomingSlots(schedule, from, until).filter((d) => !skipped.has(d.getTime()));
  if (!slots.length) return [];
  const existing = await db.quiz.findMany({
    where: {
      categoryId: schedule.categoryId,
      tournamentId: null,
      opensAt: { gte: new Date(slots[0].getTime() - MANUAL_CLASH_MS), lte: new Date(slots.at(-1)!.getTime() + MANUAL_CLASH_MS) },
    },
    select: { scheduleId: true, slotAt: true, opensAt: true },
  });
  const taken = (slot: Date) =>
    existing.some((q) =>
      q.scheduleId === schedule.id
        ? q.slotAt?.getTime() === slot.getTime()
        : Math.abs(q.opensAt.getTime() - slot.getTime()) < MANUAL_CLASH_MS,
    );
  return slots.filter((slot) => !taken(slot));
}

/**
 * Rescate (`autoquiz.rescueSlots`): un turno ya dentro de `alertHours` sin cuestionario (el generador
 * no lo va a crear) se arma con preguntas del banco y se publica en el acto. Solo si alcanzan para
 * completarlo; si no, queda el aviso `slot.unassigned`.
 */
export async function rescueSlots(now = new Date(), db: Db = prisma) {
  const schedules = await db.quizSchedule.findMany({
    where: { enabled: true, category: { active: true } },
    include: { category: true },
  });
  let rescued = 0;
  for (const schedule of schedules) {
    const s = await settingsFor(schedule.category, db);
    if (!s["autoquiz.rescueSlots"]) continue;
    const slots = await freeSlots(schedule, now, new Date(now.getTime() + s["autoquiz.alertHours"] * HOUR), db);
    if (!slots.length) continue;
    let pools = await loadCandidates(schedule.categoryId, s, now, db);
    for (const slotAt of slots) {
      const { picks, missing } = pickQuestions(pools, s["quiz.questionCount"], schedule.difficultyMix as DifficultyMix | null, {
        allowReuse: s["autoquiz.allowReuse"],
      });
      if (missing) break; // no alcanzan: los turnos siguientes tampoco
      const ids = new Set(picks.map((p) => p.id));
      pools = { fresh: removePicked(pools.fresh, ids), reusable: removePicked(pools.reusable, ids) };
      const quiz = await createSlotQuiz(schedule, slotAt, picks, s, db, { rescue: true });
      if (!quiz) continue;
      try {
        await publishQuiz(quiz.id, SYSTEM_ACTOR, now);
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        logger.warn({ quizId: quiz.id, err: err.message }, "no se pudo publicar el turno rescatado");
        continue;
      }
      rescued++;
      await notifyStaff(
        {
          level: "INFO",
          kind: "slot.rescued",
          title: `${schedule.category.name}: se armó solo un cuestionario`,
          body: `El turno del ${formatDateTime(slotAt)} no tenía cuestionario: se armó “${quiz.title}” con preguntas del banco y se publicó. Hasta que abra lo podés revisar o despublicar.`,
          href: `/admin/cuestionarios/${quiz.id}`,
          dedupeKey: `slot.rescued:${quiz.id}`,
        },
        now,
        db,
      );
    }
  }
  if (rescued) logger.info({ rescued }, "turnos rescatados");
  return { rescued };
}

/** Mantiene generados los borradores de todos los calendarios habilitados. */
export async function generateDrafts(now = new Date(), db: Db = prisma) {
  const schedules = await db.quizSchedule.findMany({
    where: { enabled: true, category: { active: true } },
    include: { category: true },
  });
  let created = 0;
  let incomplete = 0;
  for (const schedule of schedules) {
    const r = await generateForSchedule(schedule, now, db);
    created += r.created;
    incomplete += r.incomplete;
  }
  if (created) logger.info({ created, incomplete }, "borradores automáticos generados");
  return { created, incomplete };
}

// ───────────────────────────── Vencimientos ─────────────────────────────

/**
 * Borradores automáticos sin aprobar:
 * - con `autoquiz.autoPublish` y completos, se publican solos `autoPublishHours` antes de abrir (aparecen como "Próximamente");
 * - si llega la apertura sin publicar, se descartan (las preguntas vuelven al banco) y se avisa.
 */
export async function handleDueDrafts(now = new Date(), db: Db = prisma) {
  const drafts = await db.quiz.findMany({
    where: { scheduleId: { not: null }, publishedAt: null },
    include: { category: true, _count: { select: { questions: true } } },
  });
  let published = 0;
  let skipped = 0;
  for (const quiz of drafts) {
    if (!quiz.category) continue;
    const s = await settingsFor(quiz.category, db);
    if (quiz.opensAt <= now) {
      // Un borrador automático se descarta; uno cargado a mano se suelta del turno y queda como borrador.
      if (quiz.createdById) await db.quiz.update({ where: { id: quiz.id }, data: { scheduleId: null, slotAt: null } });
      else await db.quiz.delete({ where: { id: quiz.id } });
      skipped++;
      await logAudit({ actorId: null, action: "quiz.autoSkipped", entityType: "Quiz", entityId: quiz.id, before: quiz }, db);
      await notifyStaff(
        {
          level: "WARNING",
          kind: "draft.skipped",
          title: `${quiz.category.name}: se salteó un cuestionario`,
          body: `El borrador “${quiz.title}” llegó a su apertura (${formatDateTime(quiz.opensAt)}) sin aprobar${
            quiz.createdById ? "; quedó como borrador suelto." : " y se descartó."
          }`,
          href: "/admin/cuestionarios/por-aprobar",
          dedupeKey: `draft.skipped:${quiz.id}`,
        },
        now,
        db,
      );
      continue;
    }
    const complete = quiz._count.questions === s["quiz.questionCount"];
    if (s["autoquiz.autoPublish"] && complete && now >= autoPublishAt(quiz.opensAt, s)) {
      try {
        await publishQuiz(quiz.id, SYSTEM_ACTOR, now);
        published++;
        await notifyStaff(
          {
            level: "INFO",
            kind: "draft.autoPublished",
            title: `${quiz.category.name}: se publicó solo un cuestionario`,
            body: `Nadie aprobó “${quiz.title}” y se publicó automáticamente; abre ${formatDateTime(quiz.opensAt)}. Hasta que abra lo podés despublicar.`,
            href: `/admin/cuestionarios/${quiz.id}`,
            dedupeKey: `draft.autoPublished:${quiz.id}`,
          },
          now,
          db,
        );
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        logger.warn({ quizId: quiz.id, err: err.message }, "no se pudo publicar solo el borrador automático");
      }
    }
  }
  return { published, skipped };
}

/** Momento en que un borrador completo sin aprobar se publica solo. */
export function autoPublishAt(opensAt: Date, s: Settings) {
  return new Date(opensAt.getTime() - s["autoquiz.autoPublishHours"] * HOUR);
}

// ───────────────────────────── Cobertura del banco ─────────────────────────────

export type UpcomingSlot = {
  at: Date;
  /** pending = todavía sin cuestionario · excluded = día excluido · skipped = salteado a mano */
  status: "published" | "draft" | "pending" | "excluded" | "skipped";
  questions: number;
  quiz: { id: string; title: string } | null;
  /** Sin cuestionario y ya dentro de la ventana de alerta (el generador no lo crea; solo el rescate, si está activo). */
  urgent: boolean;
};

export type BankCoverage = {
  categoryId: string;
  categoryName: string;
  perQuiz: number;
  fresh: number;
  reusable: number;
  reservedInDrafts: number;
  freshByDifficulty: Record<number, number>;
  mix: DifficultyMix | null;
  upcoming: UpcomingSlot[];
  warnDays: number;
  criticalDays: number;
  coverage: Coverage;
  computedAt: Date;
  /** `autoquiz.rescueSlots`: los turnos urgentes sin cuestionario se arman solos si alcanzan las preguntas. */
  rescue: boolean;
};

/** Para cuántos turnos futuros alcanzan las preguntas nunca usadas (y con reutilizadas). */
export async function bankCoverage(schedule: ScheduleWithCategory, now = new Date(), db: Db = prisma): Promise<BankCoverage> {
  const s = await settingsFor(schedule.category, db);
  const warnDays = s["autoquiz.coverageWarnDays"];
  const until = new Date(now.getTime() + Math.max(s["autoquiz.horizonDays"], warnDays) * DAY);
  const skipped = new Set(schedule.skippedSlots.map((d) => d.getTime()));
  const grid = schedule.enabled ? gridSlots(schedule, now, until) : [];
  const quizzes = grid.length
    ? await db.quiz.findMany({
        where: {
          categoryId: schedule.categoryId,
          tournamentId: null,
          opensAt: { gte: new Date(grid[0].at.getTime() - MANUAL_CLASH_MS), lte: new Date(until.getTime() + MANUAL_CLASH_MS) },
        },
        select: { id: true, title: true, scheduleId: true, slotAt: true, opensAt: true, publishedAt: true, _count: { select: { questions: true } } },
      })
    : [];
  const quizFor = (at: Date) =>
    quizzes.find((q) => q.scheduleId === schedule.id && q.slotAt?.getTime() === at.getTime()) ??
    quizzes.find((q) => !q.slotAt && Math.abs(q.opensAt.getTime() - at.getTime()) < MANUAL_CLASH_MS);
  const alertUntil = now.getTime() + s["autoquiz.alertHours"] * HOUR;
  const perQuiz = s["quiz.questionCount"];
  const upcoming: UpcomingSlot[] = grid.map(({ at, excluded }) => {
    const q = excluded ? undefined : quizFor(at);
    const status = excluded
      ? "excluded"
      : q
        ? q.publishedAt
          ? "published"
          : "draft"
        : skipped.has(at.getTime())
          ? "skipped"
          : "pending";
    return {
      at,
      status,
      questions: q?._count.questions ?? 0,
      quiz: q ? { id: q.id, title: q.title } : null,
      urgent: status === "pending" && at.getTime() <= alertUntil,
    };
  });
  const { fresh, reusable } = await loadCandidates(schedule.categoryId, s, now, db);
  const freshByDifficulty: Record<number, number> = {};
  for (const q of fresh) freshByDifficulty[q.difficulty] = (freshByDifficulty[q.difficulty] ?? 0) + 1;
  const pending = upcoming.filter((u) => u.status === "draft" || u.status === "pending");
  return {
    categoryId: schedule.categoryId,
    categoryName: schedule.category.name,
    perQuiz,
    fresh: fresh.length,
    reusable: reusable.length,
    reservedInDrafts: pending.reduce((a, u) => a + Math.min(u.questions, perQuiz), 0),
    freshByDifficulty,
    mix: schedule.difficultyMix as DifficultyMix | null,
    upcoming,
    computedAt: now,
    rescue: s["autoquiz.rescueSlots"],
    warnDays,
    criticalDays: s["autoquiz.coverageCriticalDays"],
    coverage: projectCoverage({
      slots: pending.map((u) => ({ at: u.at, reserved: Math.min(u.questions, perQuiz) })),
      perQuiz,
      fresh: fresh.length,
      reusable: reusable.length,
      now,
      warnDays,
      criticalDays: s["autoquiz.coverageCriticalDays"],
    }),
  };
}

export async function listBankCoverage(now = new Date(), db: Db = prisma) {
  const schedules = await db.quizSchedule.findMany({
    where: { enabled: true, category: { active: true } },
    include: { category: true },
    orderBy: { category: { name: "asc" } },
  });
  return Promise.all(schedules.map((sch) => bankCoverage(sch, now, db)));
}

export function coverageMessage(c: BankCoverage) {
  const cov = c.coverage;
  const until = cov.freshCoveredUntil
    ? `alcanzan hasta el ${formatDate(cov.freshCoveredUntil, DEFAULT_TZ, "EEE d/M")}`
    : "no alcanzan ni para el próximo turno";
  const parts = [`Las preguntas nuevas (${c.fresh}) ${until}.`];
  if (cov.freshShortfall) parts.push(`Para los próximos ${c.warnDays} días faltan ${cov.freshShortfall} preguntas nuevas.`);
  if (cov.freshShortfall && c.reusable)
    parts.push(
      cov.totalShortfall
        ? `Aun reutilizando faltan ${cov.totalShortfall}.`
        : `Se pueden cubrir reutilizando preguntas viejas, pero conviene cargar nuevas.`,
    );
  return parts.join(" ");
}

/** Avisa a admins y mods cuando el banco de una categoría no alcanza para los turnos que vienen. */
export async function notifyCoverage(now = new Date(), db: Db = prisma) {
  const list = await listBankCoverage(now, db);
  let sent = 0;
  for (const c of list) {
    if (c.coverage.level === "OK") continue;
    sent += await notifyStaff(
      {
        level: c.coverage.level,
        kind: "bank.coverage",
        title:
          c.coverage.level === "CRITICAL"
            ? `${c.categoryName}: se acaban las preguntas nuevas`
            : `${c.categoryName}: hay que cargar preguntas`,
        body: coverageMessage(c),
        href: "/admin/preguntas/cobertura",
        dedupeKey: `bank.coverage:${c.categoryId}:${c.coverage.level}:${weekKey(now)}`,
      },
      now,
      db,
    );
  }
  return { categories: list.length, sent };
}

/** Avisos sobre borradores: sin aprobar cerca de la apertura, incompletos o con reutilizadas. */
export async function notifyDrafts(now = new Date(), db: Db = prisma) {
  const drafts = await db.quiz.findMany({
    where: { scheduleId: { not: null }, publishedAt: null, opensAt: { gt: now } },
    include: { category: true, questions: { select: { reused: true } } },
    orderBy: { opensAt: "asc" },
  });
  let sent = 0;
  for (const quiz of drafts) {
    if (!quiz.category) continue;
    const s = await settingsFor(quiz.category, db);
    const when = formatDateTime(quiz.opensAt);
    const href = `/admin/cuestionarios/${quiz.id}`;
    const urgent = quiz.opensAt.getTime() - now.getTime() <= s["autoquiz.alertHours"] * HOUR;
    const missing = s["quiz.questionCount"] - quiz.questions.length;
    const reused = quiz.questions.filter((q) => q.reused).length;
    if (missing > 0)
      sent += await notifyStaff(
        {
          level: urgent ? "CRITICAL" : "WARNING",
          kind: "draft.incomplete",
          title: `${quiz.category.name}: borrador incompleto`,
          body: `“${quiz.title}” (abre ${when}) tiene ${quiz.questions.length} de ${s["quiz.questionCount"]} preguntas: no hay suficientes aprobadas.`,
          href,
          dedupeKey: `draft.incomplete:${quiz.id}:${urgent ? "urgent" : "early"}`,
        },
        now,
        db,
      );
    else if (urgent)
      sent += await notifyStaff(
        {
          level: "WARNING",
          kind: "draft.pending",
          title: `${quiz.category.name}: cuestionario por aprobar`,
          body: `“${quiz.title}” abre ${when} y todavía no está aprobado.${
            s["autoquiz.autoPublish"]
              ? ` Si nadie lo revisa se publica solo el ${formatDateTime(autoPublishAt(quiz.opensAt, s))}.`
              : " Si nadie lo aprueba, ese turno se saltea."
          }`,
          href,
          dedupeKey: `draft.pending:${quiz.id}`,
        },
        now,
        db,
      );
    if (reused > 0)
      sent += await notifyStaff(
        {
          level: "INFO",
          kind: "draft.reused",
          title: `${quiz.category.name}: borrador con preguntas reutilizadas`,
          body: `“${quiz.title}” (abre ${when}) usa ${reused} pregunta(s) ya jugadas porque no alcanzaron las nuevas.`,
          href,
          dedupeKey: `draft.reused:${quiz.id}`,
        },
        now,
        db,
      );
  }

  // Turnos sin cuestionario ya dentro de la ventana de alerta: el generador no los va a crear.
  for (const slot of await unreadySlots(now, undefined, db)) {
    if (slot.quiz) continue;
    sent += await notifyStaff(
      {
        level: "CRITICAL",
        kind: "slot.unassigned",
        title: `${slot.categoryName}: turno sin cuestionario`,
        body: `El turno del ${formatDateTime(slot.at)} no tiene cuestionario. Asignale uno o se va a perder.`,
        href: `/admin/cuestionarios/nuevo?ref=c:${slot.categoryId}&turno=${slot.at.toISOString()}`,
        dedupeKey: `slot.unassigned:${slot.categoryId}:${slot.at.toISOString()}`,
      },
      now,
      db,
    );
  }
  return { sent };
}

export type UnreadySlot = {
  categoryId: string;
  categoryName: string;
  at: Date;
  /** null = sin cuestionario; si no, un borrador sin publicar o incompleto. */
  quiz: { id: string; title: string; questions: number; published: boolean } | null;
};

/**
 * Turnos de las próximas `hours` horas (default `autoquiz.alertHours` de cada categoría) que no tienen
 * un cuestionario listo: sin asignar, borrador sin aprobar o con preguntas de menos.
 */
export async function unreadySlots(now = new Date(), hours?: number, db: Db = prisma): Promise<UnreadySlot[]> {
  const schedules = await db.quizSchedule.findMany({
    where: { enabled: true, category: { active: true } },
    include: { category: true },
  });
  const out: UnreadySlot[] = [];
  for (const schedule of schedules) {
    const s = await settingsFor(schedule.category, db);
    const until = new Date(now.getTime() + (hours ?? s["autoquiz.alertHours"]) * HOUR);
    const skipped = new Set(schedule.skippedSlots.map((d) => d.getTime()));
    const slots = upcomingSlots(schedule, now, until).filter((d) => !skipped.has(d.getTime()));
    if (!slots.length) continue;
    const quizzes = await db.quiz.findMany({
      where: {
        categoryId: schedule.categoryId,
        tournamentId: null,
        opensAt: { gte: new Date(slots[0].getTime() - MANUAL_CLASH_MS), lte: new Date(until.getTime() + MANUAL_CLASH_MS) },
      },
      select: { id: true, title: true, scheduleId: true, slotAt: true, opensAt: true, publishedAt: true, _count: { select: { questions: true } } },
    });
    for (const at of slots) {
      const q =
        quizzes.find((x) => x.scheduleId === schedule.id && x.slotAt?.getTime() === at.getTime()) ??
        quizzes.find((x) => !x.slotAt && Math.abs(x.opensAt.getTime() - at.getTime()) < MANUAL_CLASH_MS);
      const ready = q && q.publishedAt && q._count.questions >= s["quiz.questionCount"];
      if (ready) continue;
      out.push({
        categoryId: schedule.categoryId,
        categoryName: schedule.category.name,
        at,
        quiz: q ? { id: q.id, title: q.title, questions: q._count.questions, published: !!q.publishedAt } : null,
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// ───────────────────────────── Acciones manuales ─────────────────────────────

async function loadDraft(quizId: string, now: Date, db: Db) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    include: {
      category: true,
      questions: { include: { question: { select: { difficulty: true } } }, orderBy: { position: "asc" } },
    },
  });
  if (!quiz) throw new NotFoundError("Cuestionario");
  if (getQuizStatus(quiz, now) !== "DRAFT") throw new UserError("Solo se pueden cambiar las preguntas de un borrador.");
  if (!quiz.category || quiz.tournamentId) throw new UserError("Solo para cuestionarios de liga.");
  return { ...quiz, category: quiz.category };
}

/** Cambia una pregunta del borrador por otra candidata, de la misma dificultad si hay. */
export async function replaceQuestion(
  quizId: string,
  quizQuestionId: string,
  actor: { id: string },
  now = new Date(),
  db: Db = prisma,
) {
  const quiz = await loadDraft(quizId, now, db);
  const target = quiz.questions.find((q) => q.id === quizQuestionId);
  if (!target) throw new NotFoundError("Pregunta del cuestionario");
  const s = await settingsFor(quiz.category, db);
  const pools = await loadCandidates(quiz.categoryId!, s, now, db);
  const inQuiz = new Set(quiz.questions.map((q) => q.questionId));
  const { picks } = pickQuestions(
    { fresh: removePicked(pools.fresh, inQuiz), reusable: removePicked(pools.reusable, inQuiz) },
    1,
    { [target.question.difficulty]: 1 },
    { allowReuse: s["autoquiz.allowReuse"] },
  );
  if (!picks.length) throw new UserError("No hay otra pregunta aprobada disponible en esta categoría.");
  await db.quizQuestion.update({ where: { id: target.id }, data: { questionId: picks[0].id, reused: picks[0].reused } });
  await logAudit(
    {
      actorId: actor.id,
      action: "quiz.replaceQuestion",
      entityType: "Quiz",
      entityId: quizId,
      meta: { from: target.questionId, to: picks[0].id },
    },
    db,
  );
  return picks[0];
}

/** Vuelve a elegir todas las preguntas del borrador (las actuales vuelven al banco primero). */
export async function regenerateDraft(quizId: string, actor: { id: string }, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const quiz = await loadDraft(quizId, now, tx);
    const s = await settingsFor(quiz.category, tx);
    await tx.quizQuestion.deleteMany({ where: { quizId } });
    const schedule = quiz.scheduleId ? await tx.quizSchedule.findUnique({ where: { id: quiz.scheduleId } }) : null;
    const pools = await loadCandidates(quiz.categoryId!, s, now, tx);
    const { picks, missing } = pickQuestions(
      pools,
      s["quiz.questionCount"],
      (schedule?.difficultyMix as DifficultyMix | null) ?? null,
      {
        allowReuse: s["autoquiz.allowReuse"],
      },
    );
    await tx.quizQuestion.createMany({
      data: picks.map((p, position) => ({ quizId, questionId: p.id, position, reused: p.reused })),
    });
    await logAudit({ actorId: actor.id, action: "quiz.regenerate", entityType: "Quiz", entityId: quizId, meta: { missing } }, tx);
    return { count: picks.length, missing };
  });
}

// ───────────────────────────── Completar incompletos ─────────────────────────────

type Pools = Awaited<ReturnType<typeof loadCandidates>>;
type DraftToFill = { id: string; questions: { questionId: string; position: number; question: { difficulty: number } }[] };

/** Agrega a un borrador las preguntas que le faltan, sin tocar las que ya tiene. Devuelve las agregadas y los pools restantes. */
async function topUpDraft(quiz: DraftToFill, pools: Pools, s: Settings, mix: DifficultyMix | null, db: Db) {
  const need = s["quiz.questionCount"] - quiz.questions.length;
  if (need <= 0) return { added: 0, missing: 0, pools };
  const inQuiz = new Set(quiz.questions.map((q) => q.questionId));
  const available = { fresh: removePicked(pools.fresh, inQuiz), reusable: removePicked(pools.reusable, inQuiz) };
  const { picks, missing } = pickQuestions(
    available,
    need,
    remainingMix(
      mix,
      quiz.questions.map((q) => q.question.difficulty),
    ),
    { allowReuse: s["autoquiz.allowReuse"] },
  );
  if (picks.length) {
    const start = Math.max(-1, ...quiz.questions.map((q) => q.position)) + 1;
    await db.quizQuestion.createMany({
      data: picks.map((p, i) => ({ quizId: quiz.id, questionId: p.id, position: start + i, reused: p.reused })),
    });
  }
  const ids = new Set(picks.map((p) => p.id));
  return { added: picks.length, missing, pools: { fresh: removePicked(pools.fresh, ids), reusable: removePicked(pools.reusable, ids) } };
}

const draftQuestionsInclude = {
  questions: { select: { questionId: true, position: true, question: { select: { difficulty: true } } } },
} as const;

/**
 * Completa los borradores automáticos que quedaron cortos (se cargaron preguntas después de generarlos).
 * Los más próximos primero; no cambia las preguntas que ya tienen.
 */
export async function fillIncompleteDrafts(now = new Date(), db: Db = prisma) {
  const schedules = await db.quizSchedule.findMany({
    where: { enabled: true, category: { active: true } },
    include: { category: true },
  });
  let filled = 0;
  for (const schedule of schedules) {
    const s = await settingsFor(schedule.category, db);
    const drafts = (
      await db.quiz.findMany({
        where: { scheduleId: schedule.id, publishedAt: null, opensAt: { gt: now } },
        include: draftQuestionsInclude,
        orderBy: { opensAt: "asc" },
      })
    ).filter((q) => q.questions.length < s["quiz.questionCount"]);
    if (!drafts.length) continue;
    let pools = await loadCandidates(schedule.categoryId, s, now, db);
    for (const quiz of drafts) {
      if (!pools.fresh.length && !pools.reusable.length) break;
      const r = await topUpDraft(quiz, pools, s, schedule.difficultyMix as DifficultyMix | null, db);
      pools = r.pools;
      if (r.added) {
        filled++;
        await logAudit(
          { actorId: null, action: "quiz.autoFill", entityType: "Quiz", entityId: quiz.id, meta: { added: r.added, missing: r.missing } },
          db,
        );
      }
    }
  }
  if (filled) logger.info({ filled }, "borradores automáticos completados");
  return { filled };
}

/** Completa ya un borrador incompleto (botón "Completar"). */
export async function fillDraft(quizId: string, actor: { id: string }, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await loadDraft(quizId, now, tx);
    const quiz = await tx.quiz.findUniqueOrThrow({ where: { id: quizId }, include: { ...draftQuestionsInclude, category: true } });
    const s = await settingsFor(quiz.category!, tx);
    if (quiz.questions.length >= s["quiz.questionCount"]) throw new UserError("El borrador ya tiene todas sus preguntas.");
    const schedule = quiz.scheduleId ? await tx.quizSchedule.findUnique({ where: { id: quiz.scheduleId } }) : null;
    const pools = await loadCandidates(quiz.categoryId!, s, now, tx);
    const r = await topUpDraft(quiz, pools, s, (schedule?.difficultyMix as DifficultyMix | null) ?? null, tx);
    if (!r.added) throw new UserError("No hay preguntas aprobadas disponibles para completarlo. Cargá o aprobá más en la categoría.");
    await logAudit({ actorId: actor.id, action: "quiz.fill", entityType: "Quiz", entityId: quizId, meta: { added: r.added, missing: r.missing } }, tx);
    return { added: r.added, missing: r.missing };
  });
}

/** Borradores automáticos pendientes de aprobación, por fecha de apertura. */
export async function listPendingDrafts(now = new Date(), db: Db = prisma) {
  const drafts = await db.quiz.findMany({
    where: { scheduleId: { not: null }, publishedAt: null, opensAt: { gt: now } },
    include: {
      category: true,
      questions: { select: { reused: true } },
    },
    orderBy: { opensAt: "asc" },
  });
  return Promise.all(
    drafts.map(async (q) => {
      const s = await settingsFor(q.category!, db);
      return {
        id: q.id,
        title: q.title,
        opensAt: q.opensAt,
        category: { id: q.category!.id, name: q.category!.name, icon: q.category!.icon },
        questions: q.questions.length,
        expected: s["quiz.questionCount"],
        reused: q.questions.filter((x) => x.reused).length,
        urgent: q.opensAt.getTime() - now.getTime() <= s["autoquiz.alertHours"] * HOUR,
        autoPublishAt: s["autoquiz.autoPublish"] ? autoPublishAt(q.opensAt, s) : null,
      };
    }),
  );
}
