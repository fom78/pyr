import { z } from "zod";
import { ForbiddenError } from "@/server/auth/permissions";
import { UserError } from "@/server/errors";
import { InsufficientCreditsError } from "@/server/credits/service";
import { logger } from "@/server/logger";

/** Respuesta JSON de error uniforme para route handlers. */
export function apiError(err: unknown): Response {
  if (err instanceof UserError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
  if (err instanceof ForbiddenError) return Response.json({ error: err.message, code: "FORBIDDEN" }, { status: 403 });
  if (err instanceof InsufficientCreditsError) return Response.json({ error: err.message, code: "NO_CREDITS" }, { status: 402 });
  if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos.", issues: err.issues }, { status: 400 });
  logger.error({ err }, "error inesperado en API");
  return Response.json({ error: "Error inesperado. Probá de nuevo." }, { status: 500 });
}
