import { z } from "zod";
import { prisma, type Db } from "@/server/db";
import type { Prisma, Season, SeasonStage, SeasonQualifierRule } from "@/generated/prisma/client";
import { slugify } from "@/lib/text";
import { DEFAULT_TZ, formatDateTime } from "@/lib/format";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { logger } from "@/server/logger";
import { notifyStaff } from "@/server/notifications/service";
import { cancelTournament, publishTournament, saveTournament, tournamentInput } from "@/server/tournaments/service";
import { addDays, creationOrder, localDay, seasonTimeline, stageStart, validateSeason, type RulePlan, type StagePlan } from "./plan";

/**
 * Temporadas: una plantilla (`Season`) de torneos con fechas relativas a un "día 0" (`SeasonStage`) y
 * reglas de clasificación por rango de puestos hacia sus eliminatorias (`SeasonQualifierRule`).
 * Lanzarla crea una instancia (`SeasonRun`) con todos sus torneos de verdad, publicados; desde ahí son
 * torneos comunes. Con `repeatAfterDays` la siguiente instancia se lanza sola (tarea `seasons`).
 */

const DAY = 86_400_000;
const PLAN_DAY0 = "2030-01-07"; // día 0 de referencia para validar la configuración de una etapa

export const seasonInput = z.object({
  name: z.string().trim().min(3, "Mínimo 3 caracteres.").max(60),
  description: z.string().trim().max(3000).optional(),
  imageKey: z.string().trim().max(300).optional(),
  repeatAfterDays: z.coerce.number().int().min(0, "Mínimo 0 días.").max(365).nullable(),
});

export const stageMeta = z.object({
  name: z.string().trim().min(3, "Mínimo 3 caracteres.").max(50),
  offsetDays: z.coerce.number().int().min(0, "El día 0 es el primero.").max(730, "Máximo 2 años."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)."),
});

/** Lo que se guarda en `SeasonStage.config`: la entrada de un torneo sin nombre, fechas absolutas, clasificatorios ni serie. */
export type StageConfig = Omit<z.infer<typeof tournamentInput>, "name" | "slug" | "startsAt" | "qualifiers" | "repeatEveryDays">;

async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>) {
  const root = base.slice(0, 55);
  let slug = root;
  for (let i = 2; await taken(slug); i++) slug = `${root}-${i}`;
  return slug;
}

export function stagePlan(s: Pick<SeasonStage, "id" | "name" | "position" | "offsetDays" | "startTime" | "config">): StagePlan {
  const c = s.config as unknown as StageConfig;
  return {
    id: s.id,
    name: s.name,
    position: s.position,
    offsetDays: s.offsetDays,
    startTime: s.startTime,
    format: c.format,
    quizCount: c.quizCount,
    frequencyHours: c.frequencyHours,
    quizActiveHours: c.quizActiveHours,
    registrationLeadDays: c.registrationLeadDays,
    lateEntryDays: c.lateEntryDays,
    questionsPerQuiz: c.questionsPerQuiz,
    maxParticipants: c.maxParticipants,
    uniqueQuestions: c.uniqueQuestions,
    thirdPlaceMatch: c.thirdPlaceMatch,
  };
}

export function rulePlan(r: SeasonQualifierRule): RulePlan {
  return { sourceStageId: r.sourceStageId, targetStageId: r.targetStageId, fromRank: r.fromRank, toRank: r.toRank };
}

// ───────────────────────── Plantilla ─────────────────────────

export async function saveSeason(id: string | null, raw: unknown, actor: { id: string }) {
  const input = seasonInput.parse(raw);
  const before = id ? await prisma.season.findUnique({ where: { id } }) : null;
  if (id && !before) throw new NotFoundError("Temporada");
  const data = {
    name: input.name,
    description: input.description || null,
    imageKey: input.imageKey || null,
    repeatAfterDays: input.repeatAfterDays,
  };
  const saved = before
    ? await prisma.season.update({ where: { id: before.id }, data })
    : await prisma.season.create({
        data: {
          ...data,
          slug: await uniqueSlug(slugify(input.name), async (slug) => Boolean(await prisma.season.findUnique({ where: { slug } }))),
          createdById: actor.id,
        },
      });
  await logAudit({ actorId: actor.id, action: id ? "season.update" : "season.create", entityType: "Season", entityId: saved.id, before });
  return saved;
}

/**
 * Crea o edita una etapa. `config` se valida con el mismo schema que un torneo (así no hay reglas
 * duplicadas), usando un día 0 de referencia para las fechas.
 */
export async function saveStage(seasonId: string, stageId: string | null, meta: unknown, config: Record<string, unknown>, actor: { id: string }) {
  const m = stageMeta.parse(meta);
  const season = await prisma.season.findUnique({ where: { id: seasonId }, include: { stages: true } });
  if (!season) throw new NotFoundError("Temporada");
  if (stageId && !season.stages.some((s) => s.id === stageId)) throw new NotFoundError("Torneo de la temporada");
  const parsed = tournamentInput.parse({
    ...config,
    name: m.name,
    startsAt: stageStart(PLAN_DAY0, m),
    qualifiers: [],
    repeatEveryDays: null,
  });
  const stored: Partial<typeof parsed> = { ...parsed };
  for (const k of ["name", "slug", "startsAt", "qualifiers", "repeatEveryDays"] as const) delete stored[k];
  const data = { name: m.name, offsetDays: m.offsetDays, startTime: m.startTime, config: stored as Prisma.InputJsonValue };
  const stage = stageId
    ? await prisma.seasonStage.update({ where: { id: stageId }, data })
    : await prisma.seasonStage.create({
        data: { ...data, seasonId, position: Math.max(0, ...season.stages.map((s) => s.position)) + 1 },
      });
  // Si dejó de ser eliminatoria, ya no recibe clasificados.
  if (parsed.format !== "KNOCKOUT") await prisma.seasonQualifierRule.deleteMany({ where: { targetStageId: stage.id } });
  await logAudit({ actorId: actor.id, action: stageId ? "season.stage.update" : "season.stage.create", entityType: "Season", entityId: seasonId, meta: { stageId: stage.id } });
  return stage;
}

export async function deleteStage(stageId: string, actor: { id: string }) {
  const stage = await prisma.seasonStage.findUnique({ where: { id: stageId } });
  if (!stage) throw new NotFoundError("Torneo de la temporada");
  await prisma.seasonStage.delete({ where: { id: stageId } });
  await logAudit({ actorId: actor.id, action: "season.stage.delete", entityType: "Season", entityId: stage.seasonId, meta: { name: stage.name } });
}

/** Sube o baja una etapa (entre eliminatorias, la de más arriba es la de mejor nivel). */
export async function moveStage(stageId: string, dir: -1 | 1, actor: { id: string }) {
  const stage = await prisma.seasonStage.findUnique({ where: { id: stageId } });
  if (!stage) throw new NotFoundError("Torneo de la temporada");
  const list = await prisma.seasonStage.findMany({ where: { seasonId: stage.seasonId }, orderBy: { position: "asc" } });
  const i = list.findIndex((s) => s.id === stageId);
  const other = list[i + dir];
  if (!other) return;
  await prisma.$transaction([
    prisma.seasonStage.update({ where: { id: stage.id }, data: { position: other.position } }),
    prisma.seasonStage.update({ where: { id: other.id }, data: { position: stage.position } }),
  ]);
  await logAudit({ actorId: actor.id, action: "season.stage.move", entityType: "Season", entityId: stage.seasonId, meta: { stageId, dir } });
}

const rulesInput = z
  .array(
    z.object({
      sourceStageId: z.string().min(1, "Elegí el torneo de origen."),
      targetStageId: z.string().min(1, "Elegí la eliminatoria."),
      fromRank: z.coerce.number().int().min(1, "Desde el puesto 1.").max(10_000),
      toRank: z.coerce.number().int().min(1).max(10_000),
    }),
  )
  .max(50);

/** Reemplaza las reglas de clasificación. Los problemas de fechas o cupos se muestran y bloquean el lanzamiento. */
export async function saveRules(seasonId: string, raw: unknown, actor: { id: string }) {
  const rules = rulesInput.parse(raw);
  const stages = await prisma.seasonStage.findMany({ where: { seasonId } });
  const ids = new Set(stages.map((s) => s.id));
  for (const r of rules) {
    if (!ids.has(r.sourceStageId) || !ids.has(r.targetStageId)) throw new UserError("Una regla apunta a un torneo de otra temporada.");
    if (r.toRank < r.fromRank) throw new UserError(`Rango al revés: del ${r.fromRank} al ${r.toRank}.`);
  }
  await prisma.$transaction([
    prisma.seasonQualifierRule.deleteMany({ where: { seasonId } }),
    prisma.seasonQualifierRule.createMany({ data: rules.map((r) => ({ ...r, seasonId })) }),
  ]);
  await logAudit({ actorId: actor.id, action: "season.rules", entityType: "Season", entityId: seasonId, meta: { count: rules.length } });
}

export async function setSeasonArchived(id: string, archived: boolean, actor: { id: string }) {
  const s = await prisma.season.findUnique({ where: { id }, include: { _count: { select: { runs: true } } } });
  if (!s) throw new NotFoundError("Temporada");
  await prisma.season.update({ where: { id }, data: { status: archived ? "ARCHIVED" : s._count.runs ? "ACTIVE" : "DRAFT" } });
  await logAudit({ actorId: actor.id, action: archived ? "season.archive" : "season.unarchive", entityType: "Season", entityId: id });
}

export async function stopSeasonRepeat(id: string, actor: { id: string }) {
  await prisma.season.update({ where: { id }, data: { repeatAfterDays: null } });
  await logAudit({ actorId: actor.id, action: "season.stopRepeat", entityType: "Season", entityId: id });
}

// ───────────────────────── Instancias ─────────────────────────

type SeasonFull = Season & { stages: SeasonStage[]; rules: SeasonQualifierRule[] };

async function loadSeason(id: string, db: Db = prisma): Promise<SeasonFull> {
  const s = await db.season.findUnique({ where: { id }, include: { stages: { orderBy: { position: "asc" } }, rules: true } });
  if (!s) throw new NotFoundError("Temporada");
  return s;
}

/** Fechas de una instancia con ese día 0 (vista previa del lanzamiento). */
export function previewRun(season: SeasonFull, day0: string, now = new Date()) {
  const plans = season.stages.map(stagePlan);
  return { ...seasonTimeline(plans, day0, now), issues: validateSeason(plans, season.rules.map(rulePlan)) };
}

/**
 * Lanza una instancia: crea y publica todos sus torneos (los orígenes antes que sus eliminatorias, así
 * los clasificatorios apuntan a torneos que existen) con sus fechas absolutas y reglas. Si algo falla a
 * mitad de camino, cancela lo creado.
 */
export async function launchSeason(seasonId: string, day0: string, actor: { id: string | null }, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day0)) throw new UserError("Elegí el día de inicio.");
  const season = await loadSeason(seasonId);
  if (season.status === "ARCHIVED") throw new UserError("La temporada está archivada.");
  const plans = season.stages.map(stagePlan);
  const rules = season.rules.map(rulePlan);
  const issues = validateSeason(plans, rules);
  if (issues.length) throw new UserError(`No se puede lanzar: ${issues[0]}`);
  const tl = seasonTimeline(plans, day0, now);
  const early = plans.find((p) => tl.dates.get(p.id)!.startsAt <= now);
  if (early) throw new UserError(`"${early.name}" empezaría en el pasado: elegí un día 0 más adelante.`);

  const last = await prisma.seasonRun.findFirst({ where: { seasonId }, orderBy: { number: "desc" } });
  const number = (last?.number ?? 0) + 1;
  const run = await prisma.seasonRun.create({
    data: { seasonId, number, day0, startsAt: tl.startsAt, endsAt: tl.endsAt },
  });
  const created = new Map<string, string>(); // stageId → tournamentId
  try {
    for (const p of creationOrder(plans, rules)) {
      const stage = season.stages.find((s) => s.id === p.id)!;
      const config = stage.config as unknown as StageConfig;
      const name = `${stage.name} · ${season.name} #${number}`;
      const t = await saveTournament(
        null,
        {
          ...config,
          name,
          slug: await uniqueSlug(slugify(`${stage.name}-${season.name}-${number}`), async (slug) =>
            Boolean(await prisma.tournament.findUnique({ where: { slug }, select: { id: true } })),
          ),
          description: config.description || season.description || undefined,
          imageKey: config.imageKey || season.imageKey || undefined,
          startsAt: tl.dates.get(p.id)!.startsAt,
          repeatEveryDays: null,
          qualifiers: rules
            .filter((r) => r.targetStageId === p.id)
            .map((r) => ({ sourceTournamentId: created.get(r.sourceStageId)!, fromRank: r.fromRank, topN: r.toRank })),
        },
        actor,
        now,
      );
      await prisma.tournament.update({ where: { id: t.id }, data: { seasonRunId: run.id, seasonStageId: stage.id } });
      await publishTournament(t.id, actor);
      created.set(p.id, t.id);
    }
  } catch (err) {
    for (const id of created.values()) await cancelTournament(id, "Falló el lanzamiento de la temporada.", actor).catch(() => undefined);
    await prisma.seasonRun.update({ where: { id: run.id }, data: { status: "CANCELLED", nextCreatedAt: now } });
    throw err;
  }
  if (season.status === "DRAFT") await prisma.season.update({ where: { id: seasonId }, data: { status: "ACTIVE" } });
  await logAudit({ actorId: actor.id, action: "season.launch", entityType: "Season", entityId: seasonId, meta: { runId: run.id, number, day0 } });
  logger.info({ seasonId, runId: run.id, number }, "temporada lanzada");
  return run;
}

/** Cancela una instancia: sus torneos que no empezaron se cancelan con reintegro; los que están en curso siguen. No se repite desde ella. */
export async function cancelRun(runId: string, reason: string, actor: { id: string }, now = new Date()) {
  if (!reason.trim()) throw new UserError("Indicá el motivo.");
  const run = await prisma.seasonRun.findUnique({ where: { id: runId }, include: { tournaments: true } });
  if (!run) throw new NotFoundError("Instancia");
  if (run.status !== "ACTIVE") throw new UserError("La instancia ya terminó o fue cancelada.");
  let cancelled = 0;
  for (const t of run.tournaments)
    if ((t.status === "DRAFT" || t.status === "PUBLISHED") && t.startsAt > now) {
      await cancelTournament(t.id, reason, actor);
      cancelled++;
    }
  await prisma.seasonRun.update({ where: { id: runId }, data: { status: "CANCELLED", nextCreatedAt: run.nextCreatedAt ?? now } });
  await logAudit({ actorId: actor.id, action: "season.run.cancel", entityType: "Season", entityId: run.seasonId, meta: { runId, reason, cancelled } });
  return cancelled;
}

/** Cuándo se lanza sola la instancia siguiente: un día antes de que abra la primera inscripción. */
export function launchDueAt(plans: StagePlan[], day0: string) {
  const { dates } = seasonTimeline(plans, day0, new Date(0));
  const opens = plans.map((p) => {
    const d = dates.get(p.id)!;
    return p.registrationLeadDays > 0 ? d.registrationOpensAt : d.startsAt;
  });
  return new Date(Math.min(...opens.map((d) => d.getTime())) - DAY);
}

/** Día 0 de la instancia que sigue a `run`: `repeatAfterDays` días después de que termina. */
export function nextDay0(run: { endsAt: Date }, repeatAfterDays: number) {
  return addDays(localDay(run.endsAt), repeatAfterDays);
}

/**
 * Tarea `seasons` (cada hora): cierra las instancias cuyos torneos ya terminaron y lanza la siguiente
 * de las temporadas que se repiten, con anticipación para que su inscripción abra a tiempo.
 */
export async function runSeasons(now = new Date()) {
  let finished = 0;
  const active = await prisma.seasonRun.findMany({ where: { status: "ACTIVE" }, include: { tournaments: { select: { status: true } } } });
  for (const r of active)
    if (r.tournaments.length && r.tournaments.every((t) => t.status === "FINISHED" || t.status === "CANCELLED")) {
      await prisma.seasonRun.update({ where: { id: r.id }, data: { status: "FINISHED" } });
      finished++;
    }

  let launched = 0;
  const seasons = await prisma.season.findMany({
    where: { status: "ACTIVE", repeatAfterDays: { not: null } },
    include: { stages: true, runs: { orderBy: { number: "desc" }, take: 1 } },
  });
  for (const s of seasons) {
    const last = s.runs[0];
    if (!last || last.nextCreatedAt || last.status === "CANCELLED" || !s.stages.length) continue;
    const day0 = nextDay0(last, s.repeatAfterDays!);
    if (now < launchDueAt(s.stages.map(stagePlan), day0)) continue;
    const claimed = await prisma.seasonRun.updateMany({ where: { id: last.id, nextCreatedAt: null }, data: { nextCreatedAt: now } });
    if (!claimed.count) continue;
    try {
      const run = await launchSeason(s.id, day0, { id: null }, now);
      launched++;
      await notifyStaff({
        level: "INFO",
        kind: "season.launched",
        title: `Se lanzó ${s.name} #${run.number}`,
        body: `Empieza el ${formatDateTime(run.startsAt, DEFAULT_TZ)} y termina el ${formatDateTime(run.endsAt, DEFAULT_TZ)}. Revisá que el banco tenga preguntas.`,
        href: `/admin/temporadas/${s.id}`,
        dedupeKey: `season.launched:${run.id}`,
      });
    } catch (err) {
      logger.error({ err, seasonId: s.id }, "no se pudo lanzar la siguiente instancia");
      await notifyStaff({
        level: "CRITICAL",
        kind: "season.launchFailed",
        title: `No se pudo lanzar la siguiente instancia de ${s.name}`,
        body: `${err instanceof Error ? err.message : "Error inesperado."} Lanzala a mano desde la temporada.`,
        href: `/admin/temporadas/${s.id}`,
        dedupeKey: `season.launchFailed:${last.id}`,
      });
    }
  }
  return { finished, launched };
}

// ───────────────────────── Consultas ─────────────────────────

export async function listSeasons() {
  const seasons = await prisma.season.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { stages: true } }, runs: { orderBy: { number: "desc" }, take: 1 } },
  });
  return seasons.map((s) => ({ ...s, lastRun: s.runs[0] ?? null }));
}

export async function getSeasonEditor(id: string) {
  const season = await loadSeason(id);
  const runs = await prisma.seasonRun.findMany({
    where: { seasonId: id },
    orderBy: { number: "desc" },
    include: { tournaments: { select: { id: true, name: true, status: true, startsAt: true, endsAt: true, format: true, seasonStageId: true }, orderBy: { startsAt: "asc" } } },
  });
  return { season, runs };
}

/** Página pública: la instancia más reciente (o la pedida) con sus torneos y cómo se clasifica. */
export async function getPublicSeason(slug: string, number?: number) {
  const season = await prisma.season.findUnique({
    where: { slug },
    include: { stages: { orderBy: { position: "asc" } }, rules: true, runs: { orderBy: { number: "desc" }, select: { id: true, number: true, status: true, startsAt: true, endsAt: true } } },
  });
  if (!season || !season.runs.length) return null;
  const run = number ? season.runs.find((r) => r.number === number) : season.runs[0];
  if (!run) return null;
  const tournaments = await prisma.tournament.findMany({
    where: { seasonRunId: run.id, status: { not: "DRAFT" } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      format: true,
      startsAt: true,
      endsAt: true,
      registrationOpensAt: true,
      registrationEndsAt: true,
      entryCost: true,
      maxParticipants: true,
      seasonStageId: true,
      // Las reglas reales de la instancia (la plantilla pudo cambiar después de lanzarla).
      qualifiers: { select: { fromRank: true, topN: true, sourceTournamentId: true }, orderBy: { fromRank: "asc" } },
      _count: { select: { entries: true } },
    },
  });
  return { season, run, tournaments };
}

/** Para el detalle de un torneo: su temporada y a qué eliminatorias clasifica. */
export async function seasonContext(t: { id: string; seasonRunId: string | null; seasonStageId: string | null }) {
  if (!t.seasonRunId) return null;
  const run = await prisma.seasonRun.findUnique({ where: { id: t.seasonRunId }, include: { season: { select: { name: true, slug: true } } } });
  if (!run) return null;
  const feeds = await prisma.tournamentQualifier.findMany({
    where: { sourceTournamentId: t.id },
    include: { tournament: { select: { name: true, slug: true } } },
    orderBy: { fromRank: "asc" },
  });
  return {
    name: run.season.name,
    slug: run.season.slug,
    number: run.number,
    feeds: feeds.map((f) => ({ fromRank: f.fromRank, toRank: f.topN, name: f.tournament.name, slug: f.tournament.slug })),
  };
}
