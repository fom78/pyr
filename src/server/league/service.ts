import { prisma, type Db } from "@/server/db";
import { getCategorySettings, getSettings } from "@/server/config/service";
import { UserError, NotFoundError } from "@/server/errors";
import { getActiveBan } from "@/server/users/bans";
import { recomputeCategoryStandings } from "@/server/ranking/service";
import { checkJoin, effectiveStatus, leaveDates, livesUsed } from "./lives";

export async function getUserMemberships(userId: string, db: Db = prisma) {
  return db.categoryMembership.findMany({ where: { userId }, include: { category: true }, orderBy: { joinedAt: "asc" } });
}

/** Resumen de vidas para mostrar al usuario. */
export async function getLivesSummary(userId: string, now = new Date(), db: Db = prisma) {
  const [memberships, s] = await Promise.all([getUserMemberships(userId, db), getSettings(db)]);
  const used = livesUsed(memberships, now);
  return {
    max: s["lives.max"],
    used,
    free: Math.max(0, s["lives.max"] - used),
    active: memberships.filter((m) => effectiveStatus(m, now) === "ACTIVE"),
    leaving: memberships.filter((m) => effectiveStatus(m, now) === "LEAVING"),
    memberships,
  };
}

export async function joinCategory(userId: string, categoryId: string, now = new Date(), db: typeof prisma = prisma) {
  if (await getActiveBan(userId, now, db)) throw new UserError("Tu cuenta está suspendida: no podés inscribirte.");
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category || !category.active) throw new NotFoundError("Categoría");
  return db.$transaction(async (tx) => {
    // Serializa operaciones de vidas del mismo usuario
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const [memberships, s] = await Promise.all([tx.categoryMembership.findMany({ where: { userId } }), getSettings(tx)]);
    const check = checkJoin(memberships, categoryId, s["lives.max"], now);
    if (!check.ok) throw new UserError(check.message, check.reason);
    // Las inscripciones vencidas (LEAVING ya liberada) se marcan LEFT al pasar
    await tx.categoryMembership.updateMany({
      where: { userId, status: "LEAVING", lifeReleasesAt: { lte: now } },
      data: { status: "LEFT" },
    });
    const m = await tx.categoryMembership.create({ data: { userId, categoryId, joinedAt: now } });
    return { membership: m, livesLeft: check.livesLeftAfter };
  });
}

export async function leaveCategory(userId: string, categoryId: string, now = new Date(), db: Db = prisma) {
  const m = await db.categoryMembership.findFirst({ where: { userId, categoryId, status: "ACTIVE" } });
  if (!m) throw new UserError("No participás en esta categoría.");
  const category = await db.category.findUniqueOrThrow({ where: { id: categoryId } });
  const s = await getCategorySettings(category, db);
  const dates = leaveDates(now, s["league.leaveCooldownDays"], s["league.rejoinBlockDays"]);
  const updated = await db.categoryMembership.update({
    where: { id: m.id },
    data: { status: s["league.leaveCooldownDays"] > 0 ? "LEAVING" : "LEFT", leaveRequestedAt: now, ...dates },
  });
  // Deja de figurar en la tabla inmediatamente
  await recomputeCategoryStandings(categoryId, now, db);
  return updated;
}

/** Job: pasa a LEFT las desvinculaciones cumplidas. */
export async function releaseExpiredLeaves(now = new Date(), db: Db = prisma) {
  const r = await db.categoryMembership.updateMany({
    where: { status: "LEAVING", lifeReleasesAt: { lte: now } },
    data: { status: "LEFT" },
  });
  return r.count;
}

export async function isActiveMember(userId: string, categoryId: string, now = new Date(), db: Db = prisma) {
  const ms = await db.categoryMembership.findMany({ where: { userId, categoryId } });
  return ms.some((m) => effectiveStatus(m, now) === "ACTIVE");
}
