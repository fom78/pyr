import { prisma, type Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

/** Filtro Prisma para bans vigentes en `now`. */
export function activeBanWhere(now: Date): Prisma.BanWhereInput {
  return {
    revokedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export function isBanActive(ban: { startsAt: Date; endsAt: Date | null; revokedAt: Date | null }, now = new Date()) {
  return !ban.revokedAt && ban.startsAt <= now && (ban.endsAt === null || ban.endsAt > now);
}

export async function getActiveBan(userId: string, now = new Date(), db: Db = prisma) {
  return db.ban.findFirst({ where: { userId, ...activeBanWhere(now) }, orderBy: { startsAt: "desc" } });
}
