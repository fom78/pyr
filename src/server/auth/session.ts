import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { getActiveBan } from "@/server/users/bans";
import { getSettings } from "@/server/config/service";
import { can, type Action, type ModGrants, type Role } from "@/server/auth/permissions";
import type { Settings } from "@/server/config/registry";

export type CurrentUser = {
  id: string;
  username: string | null;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  timezone: string;
  onboardedAt: Date | null;
  banned: boolean;
  ban: { reason: string; endsAt: Date | null } | null;
};

export function modGrants(s: Settings): ModGrants {
  return { canBan: s["mods.canBan"], canPublishQuizzes: s["mods.canPublishQuizzes"] };
}

/** Usuario de la sesión actual (memoizado por request). Rol y baneo se leen siempre de la DB. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, name: true, email: true, image: true, role: true, timezone: true, onboardedAt: true },
  });
  if (!user) return null;
  const ban = await getActiveBan(user.id);
  return { ...user, banned: Boolean(ban), ban: ban ? { reason: ban.reason, endsAt: ban.endsAt } : null };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  return user;
}

export async function userCan(user: CurrentUser | null, action: Action) {
  if (!user) return false;
  const s = await getSettings();
  return can(user, action, modGrants(s));
}

/** Para páginas: exige sesión y permiso; si no, 403. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await userCan(user, action))) forbidden();
  return user;
}
