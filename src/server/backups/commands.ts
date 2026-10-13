import { formatDate, DEFAULT_TZ } from "@/lib/format";

/**
 * Piezas puras del backup: comando de pg_dump, nombre del entorno y de los archivos.
 * El password nunca va en los argumentos (se ve en `ps`): va en PGPASSWORD.
 */
export type DumpCommand = { cmd: string; args: string[]; env: Record<string, string> };

export function dumpCommand(env: { DATABASE_URL?: string; BACKUP_PG_DUMP?: string }): DumpCommand {
  // Override (ej. en Windows sin pg_dump: "docker compose exec -T db pg_dump -U pyr pyr").
  const override = env.BACKUP_PG_DUMP?.trim();
  if (override) {
    const [cmd, ...args] = override.split(/\s+/);
    return { cmd, args, env: {} };
  }
  if (!env.DATABASE_URL) throw new Error("Falta DATABASE_URL para el backup.");
  const url = new URL(env.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL no indica la base de datos.");
  return {
    cmd: "pg_dump",
    args: [
      "--no-owner",
      "--no-privileges",
      "-h",
      url.hostname,
      "-p",
      url.port || "5432",
      "-U",
      decodeURIComponent(url.username),
      "-d",
      database,
    ],
    env: url.password ? { PGPASSWORD: decodeURIComponent(url.password) } : {},
  };
}

/**
 * Nombre del entorno para los archivos (pyr-prod-…, pyr-dev-…): así un backup de staging nunca se
 * confunde con uno de producción. `APP_ENV` manda; si falta, se deduce de `APP_URL`.
 */
export function backupEnvName(env: { APP_ENV?: string; APP_URL?: string }) {
  const explicit = env.APP_ENV?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (explicit) return explicit;
  let host = "";
  try {
    host = new URL(env.APP_URL ?? "").hostname;
  } catch {
    return "local";
  }
  if (!host || host === "localhost" || host.startsWith("127.") || host.endsWith(".localhost")) return "local";
  return /(^|[.-])(dev|staging)([.-]|$)/.test(host) ? "dev" : "prod";
}

const STAMP = "yyyyMMdd-HHmmss";

/** Nombres de los archivos de un backup (hora de Buenos Aires, ordenan bien alfabéticamente). */
export function backupFileNames(envName: string, now: Date, tz = DEFAULT_TZ) {
  const base = `pyr-${envName}-${formatDate(now, tz, STAMP)}`;
  return { db: `${base}.sql.gz`, uploads: `${base}-uploads.tar.gz` };
}

/** Solo nombres generados por `backupFileNames` (nada de rutas). */
export function isBackupFileName(name: string) {
  return /^pyr-[a-z0-9-]+-\d{8}-\d{6}(-uploads\.tar|\.sql)\.gz$/.test(name);
}
