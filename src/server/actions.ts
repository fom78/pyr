import { z } from "zod";
import { APIError } from "better-auth/api";
import { unstable_rethrow } from "next/navigation";
import { ForbiddenError } from "@/server/auth/permissions";
import { UserError } from "@/server/errors";
import { InsufficientCreditsError } from "@/server/credits/service";
import { logger } from "@/server/logger";

/** Estado estándar que devuelven las server actions usadas con useActionState. */
export type FormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valores enviados, para no perder lo que escribió el usuario si hay error. */
  values?: Record<string, string>;
} | null;

const AUTH_MESSAGES: Record<string, string> = {
  INVALID_USERNAME_OR_PASSWORD: "Usuario o contraseña incorrectos.",
  INVALID_EMAIL_OR_PASSWORD: "Usuario o contraseña incorrectos.",
  USERNAME_IS_ALREADY_TAKEN: "Ese nombre de usuario ya está en uso.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese email.",
  PASSWORD_TOO_SHORT: "La contraseña es demasiado corta.",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
  INVALID_USERNAME: "El nombre de usuario no es válido.",
  USERNAME_TOO_SHORT: "El nombre de usuario es demasiado corto.",
  USERNAME_TOO_LONG: "El nombre de usuario es demasiado largo.",
  INVALID_PASSWORD: "La contraseña actual no es correcta.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Tu cuenta no tiene contraseña (ingresaste con Google).",
};

/** Convierte cualquier error en un FormState amable. Re-lanza redirects de Next. */
export function toFormState(err: unknown, values?: Record<string, string>): FormState {
  unstable_rethrow(err); // deja pasar redirect()/notFound()/forbidden() de Next
  if (err instanceof z.ZodError) {
    return { ok: false, error: "Revisá los datos ingresados.", fieldErrors: z.flattenError(err).fieldErrors as Record<string, string[]>, values };
  }
  if (err instanceof UserError || err instanceof ForbiddenError || err instanceof InsufficientCreditsError) {
    return { ok: false, error: err.message, values };
  }
  if (err instanceof APIError) {
    const code = (err.body as { code?: string } | undefined)?.code ?? "";
    if (err.status === "TOO_MANY_REQUESTS" || err.statusCode === 429)
      return { ok: false, error: "Demasiados intentos. Esperá un minuto y volvé a probar.", values };
    return { ok: false, error: AUTH_MESSAGES[code] ?? err.body?.message ?? "No se pudo completar la operación.", values };
  }
  logger.error({ err }, "error inesperado en server action");
  return { ok: false, error: "Ocurrió un error inesperado. Probá de nuevo en unos segundos.", values };
}

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !/password/i.test(k)) out[k] = v;
  return out;
}
