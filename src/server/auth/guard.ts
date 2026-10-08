import "server-only";
import { getCurrentUser, modGrants, type CurrentUser } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { assertCan, type Action } from "@/server/auth/permissions";
import { UserError } from "@/server/errors";

/** Para server actions y route handlers: devuelve el usuario o lanza (ForbiddenError / UserError 401). */
export async function authorize(action: Action): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Tu sesión expiró. Volvé a ingresar.", "UNAUTHENTICATED", 401);
  const s = await getSettings();
  assertCan(user, action, modGrants(s));
  return user;
}
