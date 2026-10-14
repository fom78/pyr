import { prisma, type Db } from "@/server/db";
import { Prisma, type Tournament } from "@/generated/prisma/client";
import { getSettings } from "@/server/config/service";
import type { Settings } from "@/server/config/registry";
import { logAudit } from "@/server/audit";
import { logger } from "@/server/logger";
import { notifyStaff } from "@/server/notifications/service";
import { draftQuestionsInclude, loadCandidates, topUpDraft } from "@/server/autoquiz/service";
import { formatDateTime } from "@/lib/format";
import { mergePools, pickAcrossCategories, type CategoryPool } from "./pick";
import { tournamentTimeline } from "./timeline";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Un cuestionario manual a menos de esto de un turno lo ocupa (como en la liga). */
const MANUAL_CLASH_MS = 6 * HOUR;

type AutoTournament = Tournament & { categories: { categoryId: string }[] };

async function autoTournaments(now: Date, db: Db) {
  return db.tournament.findMany({
    where: { status: "PUBLISHED", autoQuizzes: true, endsAt: { gt: now } },
    include: { categories: { select: { categoryId: true } } },
  });
}

async function poolsFor(t: AutoTournament, s: Settings, now: Date, db: Db): Promise<CategoryPool[]> {
  return Promise.all(t.categories.map((c) => loadCandidates(c.categoryId, s, now, db)));
}

function removeIds(pools: CategoryPool[], ids: Set<string>): CategoryPool[] {
  return pools.map((p) => ({ fresh: p.fresh.filter((c) => !ids.has(c.id)), reusable: p.reusable.filter((c) => !ids.has(c.id)) }));
}

/** Turnos del torneo con su cuestionario (si tiene). Un manual sin turno a menos de 6 h ocupa el turno. */
export async function tournamentSlots(t: Tournament, now = new Date(), db: Db = prisma) {
  const slots = tournamentTimeline(t, now).slots;
  const quizzes = await db.quiz.findMany({
    where: { tournamentId: t.id },
    select: { id: true, title: true, slotAt: true, opensAt: true, publishedAt: true, _count: { select: { questions: true } } },
  });
  const skipped = new Set(t.skippedSlots.map((d) => d.getTime()));
  return slots.map((at, i) => {
    const quiz =
      quizzes.find((q) => q.slotAt?.getTime() === at.getTime()) ??
      quizzes.find((q) => !q.slotAt && Math.abs(q.opensAt.getTime() - at.getTime()) < MANUAL_CLASH_MS);
    return {
      at,
      n: i + 1,
      skipped: !quiz && skipped.has(at.getTime()),
      quiz: quiz ? { id: quiz.id, title: quiz.title, questions: quiz._count.questions, published: Boolean(quiz.publishedAt) } : null,
    };
  });
}

/**
 * Arma los borradores de los torneos con cuestionarios automáticos (tarea `autoquiz`): uno por turno
 * que todavía no tiene cuestionario, hasta `autoquiz.horizonDays`. Las preguntas salen del banco de
 * sus categorías (nuevas primero y repartidas; si faltan, reutilizadas). Después siguen el mismo
 * camino que los de la liga: aprobar, publicación automática o descarte al llegar la apertura.
 */
export async function generateTournamentDrafts(now = new Date(), db: Db = prisma) {
  const s = await getSettings(db);
  const until = new Date(now.getTime() + s["autoquiz.horizonDays"] * DAY);
  let created = 0;
  let incomplete = 0;
  for (const t of await autoTournaments(now, db)) {
    if (!t.categories.length) continue;
    const missingSlots = (await tournamentSlots(t, now, db)).filter((x) => !x.quiz && !x.skipped && x.at > now && x.at <= until);
    if (!missingSlots.length) continue;
    let pools = await poolsFor(t, s, now, db);
    for (const slot of missingSlots) {
      const { picks, missing } = pickAcrossCategories(pools, t.questionsPerQuiz, { allowReuse: s["autoquiz.allowReuse"] });
      pools = removeIds(pools, new Set(picks.map((p) => p.id)));
      const closesAt = new Date(Math.min(slot.at.getTime() + t.quizActiveHours * HOUR, t.endsAt.getTime()));
      try {
        const quiz = await db.quiz.create({
          data: {
            title: `${t.name} — Fecha ${slot.n}`,
            tournamentId: t.id,
            opensAt: slot.at,
            closesAt,
            expiresAt: t.endsAt,
            timeLimitSec: s["quiz.timeLimitSec"],
            scoring: t.scoring as Prisma.InputJsonValue,
            slotAt: slot.at,
            questions: { create: picks.map((p, position) => ({ questionId: p.id, position, reused: p.reused })) },
          },
        });
        created++;
        if (missing) incomplete++;
        await logAudit(
          { actorId: null, action: "quiz.autoCreate", entityType: "Quiz", entityId: quiz.id, meta: { tournamentId: t.id, slotAt: slot.at, missing } },
          db,
        );
      } catch (err) {
        // Otra corrida creó el mismo turno en paralelo (índice único [tournamentId, slotAt]).
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
  }
  if (created) logger.info({ created, incomplete }, "borradores de torneos generados");
  return { created, incomplete };
}

/** Completa los borradores de torneo que quedaron cortos (entraron preguntas al banco después). */
export async function fillTournamentDrafts(now = new Date(), db: Db = prisma) {
  const s = await getSettings(db);
  let filled = 0;
  for (const t of await autoTournaments(now, db)) {
    const drafts = (
      await db.quiz.findMany({
        where: { tournamentId: t.id, slotAt: { not: null }, createdById: null, publishedAt: null, opensAt: { gt: now } },
        include: draftQuestionsInclude,
        orderBy: { opensAt: "asc" },
      })
    ).filter((q) => q.questions.length < t.questionsPerQuiz);
    if (!drafts.length) continue;
    let pools = mergePools(await poolsFor(t, s, now, db));
    for (const quiz of drafts) {
      if (!pools.fresh.length && !pools.reusable.length) break;
      const r = await topUpDraft(quiz, pools, t.questionsPerQuiz, s["autoquiz.allowReuse"], null, db);
      pools = r.pools;
      if (r.added) {
        filled++;
        await logAudit({ actorId: null, action: "quiz.autoFill", entityType: "Quiz", entityId: quiz.id, meta: { added: r.added, missing: r.missing } }, db);
      }
    }
  }
  return { filled };
}

/**
 * ¿Alcanza el banco para los turnos del torneo que todavía no tienen cuestionario? Avisa a admins y
 * mods una vez por torneo (y otra vez si empeora a "no alcanza ni para el próximo").
 */
export async function notifyTournamentBank(now = new Date(), db: Db = prisma) {
  const s = await getSettings(db);
  let sent = 0;
  for (const t of await autoTournaments(now, db)) {
    const pending = (await tournamentSlots(t, now, db)).filter((x) => !x.quiz && !x.skipped && x.at > now);
    if (!pending.length) continue;
    const pools = mergePools(await poolsFor(t, s, now, db));
    const available = pools.fresh.length + (s["autoquiz.allowReuse"] ? pools.reusable.length : 0);
    const need = pending.length * t.questionsPerQuiz;
    if (available >= need) continue;
    const critical = available < t.questionsPerQuiz;
    sent += await notifyStaff(
      {
        level: critical ? "CRITICAL" : "WARNING",
        kind: "tournament.bankShort",
        title: `${t.name}: faltan preguntas`,
        body: `Quedan ${pending.length} cuestionario(s) por armar (desde el ${formatDateTime(pending[0].at)}) y hacen falta ${need} preguntas; en sus categorías hay ${available} disponibles.`,
        href: `/admin/torneos/${t.id}`,
        dedupeKey: `tournament.bankShort:${t.id}:${critical ? "critical" : "warning"}`,
      },
      now,
      db,
    );
  }
  return { sent };
}
