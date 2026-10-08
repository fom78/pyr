import type { MembershipStatus } from "@/generated/prisma/enums";

/** Reglas de vidas y abandono — funciones puras (el estado efectivo se deriva de las fechas). */

export type MembershipLike = {
  categoryId: string;
  status: MembershipStatus;
  lifeReleasesAt: Date | null;
  rejoinAllowedAt: Date | null;
};

const DAY = 86_400_000;

export function effectiveStatus(m: MembershipLike, now = new Date()): MembershipStatus {
  if (m.status === "LEAVING" && m.lifeReleasesAt && m.lifeReleasesAt <= now) return "LEFT";
  return m.status;
}

/** Vidas ocupadas = inscripciones activas + en período de desvinculación. */
export function livesUsed(memberships: MembershipLike[], now = new Date()) {
  return memberships.filter((m) => effectiveStatus(m, now) !== "LEFT").length;
}

export type JoinCheck =
  | { ok: true; livesLeftAfter: number }
  | { ok: false; reason: "ALREADY_MEMBER" | "LEAVING" | "NO_LIVES" | "REJOIN_BLOCKED"; message: string; until?: Date };

export function checkJoin(
  memberships: MembershipLike[],
  categoryId: string,
  maxLives: number,
  now = new Date(),
): JoinCheck {
  const current = memberships.filter((m) => m.categoryId === categoryId);
  for (const m of current) {
    const st = effectiveStatus(m, now);
    if (st === "ACTIVE") return { ok: false, reason: "ALREADY_MEMBER", message: "Ya participás en esta categoría." };
    if (st === "LEAVING")
      return {
        ok: false,
        reason: "LEAVING",
        message: "Estás en período de desvinculación de esta categoría.",
        until: m.lifeReleasesAt ?? undefined,
      };
  }
  const blocked = current
    .filter((m) => m.rejoinAllowedAt && m.rejoinAllowedAt > now)
    .sort((a, b) => b.rejoinAllowedAt!.getTime() - a.rejoinAllowedAt!.getTime())[0];
  if (blocked)
    return {
      ok: false,
      reason: "REJOIN_BLOCKED",
      message: "Saliste hace poco de esta categoría y todavía no podés volver.",
      until: blocked.rejoinAllowedAt!,
    };
  const used = livesUsed(memberships, now);
  if (used >= maxLives)
    return { ok: false, reason: "NO_LIVES", message: `Ya usaste tus ${maxLives} vidas. Abandoná una categoría para liberar una.` };
  return { ok: true, livesLeftAfter: maxLives - used - 1 };
}

export function leaveDates(now: Date, cooldownDays: number, rejoinBlockDays: number) {
  return {
    lifeReleasesAt: new Date(now.getTime() + cooldownDays * DAY),
    rejoinAllowedAt: new Date(now.getTime() + Math.max(rejoinBlockDays, cooldownDays) * DAY),
  };
}
