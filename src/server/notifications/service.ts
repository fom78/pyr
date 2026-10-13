import { prisma, type Db } from "@/server/db";
import type { NotificationAudience, NotificationLevel } from "@/generated/prisma/client";
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
  return createFor(
    staff.map((u) => u.id),
    "STAFF",
    input,
    db,
  );
}

/** Avisos del juego para jugadores puntuales (campanita del jugador). */
export async function notifyUsers(userIds: string[], input: NotificationInput, db: Db = prisma) {
  return createFor(userIds, "PLAYER", input, db);
}

async function createFor(userIds: string[], audience: NotificationAudience, input: NotificationInput, db: Db) {
  if (!userIds.length) return 0;
  const res = await db.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      audience,
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

export async function listNotifications(
  userId: string,
  audience: NotificationAudience,
  opts: { take?: number; unreadOnly?: boolean } = {},
  db: Db = prisma,
) {
  return db.notification.findMany({
    where: { userId, audience, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
}

export async function unreadCount(userId: string, audience: NotificationAudience, db: Db = prisma) {
  return db.notification.count({ where: { userId, audience, readAt: null } });
}

/**
 * Marca como leídas las indicadas, o todas las de la audiencia si `ids` no viene.
 * Solo toca las del propio usuario. Devuelve cuántas cambió.
 */
export async function markRead(
  userId: string,
  target: { ids: string[] } | { audience: NotificationAudience },
  now = new Date(),
  db: Db = prisma,
) {
  const res = await db.notification.updateMany({
    where: { userId, readAt: null, ...("ids" in target ? { id: { in: target.ids } } : { audience: target.audience }) },
    data: { readAt: now },
  });
  return res.count;
}

/** Abre una notificación propia: la marca como leída y devuelve a dónde lleva (null si no es del usuario). */
export async function openNotification(userId: string, id: string, now = new Date(), db: Db = prisma) {
  const n = await db.notification.findFirst({ where: { id, userId } });
  if (!n) return null;
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: now } });
  return n;
}
