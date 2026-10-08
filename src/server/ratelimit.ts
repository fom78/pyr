import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";

/**
 * Rate limit de ventana fija guardado en Postgres (sobrevive reinicios y sirve con varias réplicas).
 * Un solo UPSERT atómico por llamada.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number }> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateBucket" ("key", "count", "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateBucket"."windowStart" < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE "RateBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateBucket"."windowStart" < now() - make_interval(secs => ${windowSec}) THEN now() ELSE "RateBucket"."windowStart" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}

export async function assertRateLimit(key: string, limit: number, windowSec: number) {
  const r = await rateLimit(key, limit, windowSec);
  if (!r.ok) throw new UserError("Demasiadas solicitudes. Esperá un momento y volvé a intentar.", "RATE_LIMITED", 429);
}

/** Limpieza periódica (la llama el worker). */
export async function purgeRateBuckets() {
  await prisma.$executeRaw`DELETE FROM "RateBucket" WHERE "windowStart" < now() - interval '1 day'`;
}
