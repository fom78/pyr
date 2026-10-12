import { prisma, type Db } from "@/server/db";
import type { NotificationLevel } from "@/generated/prisma/client";
import { activeBanWhere } from "@/server/users/bans";

export type NotificationInput = {
  level: NotificationLevel;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  /** Mismo dedupeKey para el mismo usuario = no se repite el aviso. */
  dedupeKey: string;
};

/** Avisa a todos los admins y mods no baneados. Devuelve cuántas notificaciones nuevas se crearon. */
export async function notifyStaff(input: NotificationInput, now = new Date(), db: Db = prisma) {
  const staff = await db.user.findMany({
    where: { role: { in: ["ADMIN", "MOD"] }, bans: { none: activeBanWhere(now) } },
    select: { id: true },
  });
  if (!staff.length) return 0;
  const res = await db.notification.createMany({
    data: staff.map((u) => ({
      userId: u.id,
      level: input.level,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      dedupeKey: input.dedupeKey,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function listNotifications(userId: string, opts: { take?: number; unreadOnly?: boolean } = {}, db: Db = prisma) {
  return db.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
}

export async function unreadCount(userId: string, db: Db = prisma) {
  return db.notification.count({ where: { userId, readAt: null } });
}

/** Marca como leídas las indicadas (o todas si `ids` no viene). Solo las del propio usuario. */
export async function markRead(userId: string, ids?: string[], now = new Date(), db: Db = prisma) {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: now },
  });
}
