import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { prisma, type Db } from "@/server/db";
import { UserError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { logger } from "@/server/logger";
import { can } from "@/server/auth/permissions";
import { activeBanWhere } from "@/server/users/bans";
import { notifyStaffUser, type NotificationInput } from "@/server/notifications/service";
import { backupEnvName, backupFileNames, dumpCommand, isBackupFileName } from "./commands";
import { writeTarGz } from "./tar";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Un backup RUNNING más viejo que esto quedó colgado (se reinició el worker). */
const STUCK_MS = HOUR;
/** El nocturno no se repite si ya hubo uno programado en este lapso (el worker corre todo al arrancar). */
const NIGHTLY_MIN_GAP_MS = 20 * HOUR;

/** Carpeta de los backups (en el contenedor se monta desde la VPS: BACKUP_DIR del .env). */
export function backupDir() {
  // turbopackIgnore: es una carpeta de datos en tiempo de ejecución, no código a empaquetar.
  return path.resolve(/* turbopackIgnore: true */ process.env.BACKUP_DIR || "./storage/backups");
}

export function retentionDays() {
  const n = Number(process.env.BACKUP_RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 14;
}

export function backupEnv() {
  return backupEnvName({ APP_ENV: process.env.APP_ENV, APP_URL: process.env.APP_URL });
}

/** Ruta de un archivo de backup, validando el nombre (nunca viene de la URL). */
export function backupFilePath(name: string) {
  if (!isBackupFileName(name)) throw new UserError("Archivo de backup inválido.");
  return path.join(backupDir(), name);
}

/** Pedido manual desde el panel: lo ejecuta el worker (tarea `backups`, cada minuto). */
export async function requestBackup(actor: { id: string }, db: Db = prisma) {
  const busy = await db.backup.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new UserError("Ya hay un backup en curso. Esperá a que termine.");
  const backup = await db.backup.create({ data: { kind: "MANUAL", requestedById: actor.id } });
  await logAudit({ actorId: actor.id, action: "backup.request", entityType: "Backup", entityId: backup.id }, db);
  return backup;
}

export async function listBackups(db: Db = prisma) {
  return db.backup.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { requestedBy: { select: { name: true } } } });
}

async function notifyAdmins(input: NotificationInput, now: Date, db: Db) {
  const staff = await db.user.findMany({
    where: { role: { in: ["ADMIN", "MOD"] }, bans: { none: activeBanWhere(now) } },
    select: { id: true, role: true },
  });
  for (const u of staff) if (can(u, "backup.manage")) await notifyStaffUser(u.id, input, db);
}

/** Corre pg_dump → gzip → archivo. Rechaza si el proceso termina con error. */
async function dumpDatabase(outFile: string) {
  const { cmd, args, env } = dumpCommand({ DATABASE_URL: process.env.DATABASE_URL, BACKUP_PG_DUMP: process.env.BACKUP_PG_DUMP });
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-2000);
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.on("error", (err) => reject(new Error(`No se pudo ejecutar ${cmd}: ${err.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} terminó con código ${code}: ${stderr.trim()}`))));
  });
  await Promise.all([pipeline(child.stdout, createGzip({ level: 9 }), createWriteStream(outFile)), exited]);
}

/** Genera los archivos de un backup. Escribe primero a .tmp y renombra al terminar. */
async function performBackup(now: Date) {
  const dir = backupDir();
  await mkdir(dir, { recursive: true });
  const names = backupFileNames(backupEnv(), now);
  const out: { dbFile: string; dbBytes: bigint; uploadsFile: string | null; uploadsBytes: bigint | null } = {
    dbFile: names.db,
    dbBytes: BigInt(0),
    uploadsFile: null,
    uploadsBytes: null,
  };
  const dbPath = path.join(dir, names.db);
  try {
    await dumpDatabase(`${dbPath}.tmp`);
    await rename(`${dbPath}.tmp`, dbPath);
  } catch (err) {
    await rm(`${dbPath}.tmp`, { force: true });
    throw err;
  }
  out.dbBytes = BigInt((await stat(dbPath)).size);
  // Imágenes: solo con storage local (con S3 ya viven fuera del servidor).
  const uploadsDir = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_LOCAL_DIR || "./storage/uploads");
  if (process.env.STORAGE_DRIVER !== "s3" && existsSync(uploadsDir)) {
    const upPath = path.join(dir, names.uploads);
    try {
      await writeTarGz(uploadsDir, `${upPath}.tmp`);
      await rename(`${upPath}.tmp`, upPath);
    } catch (err) {
      await rm(`${upPath}.tmp`, { force: true });
      throw err;
    }
    out.uploadsFile = names.uploads;
    out.uploadsBytes = BigInt((await stat(upPath)).size);
  }
  return out;
}

/** Tarea `backups` (cada minuto): marca los colgados y ejecuta el próximo pendiente. */
export async function runPendingBackups(now = new Date(), db: Db = prisma) {
  const stuck = await db.backup.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
    data: { status: "FAILED", error: "Se interrumpió (¿se reinició el worker?).", finishedAt: now },
  });
  const next = await db.backup.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (!next) return { ran: 0, stuck: stuck.count };
  const claimed = await db.backup.updateMany({ where: { id: next.id, status: "PENDING" }, data: { status: "RUNNING", startedAt: now } });
  if (!claimed.count) return { ran: 0, stuck: stuck.count };
  const started = Date.now();
  try {
    const files = await performBackup(now);
    await db.backup.update({ where: { id: next.id }, data: { status: "DONE", ...files, finishedAt: new Date() } });
    logger.info({ backupId: next.id, ...files, dbBytes: Number(files.dbBytes), uploadsBytes: Number(files.uploadsBytes ?? 0), ms: Date.now() - started }, "backup listo");
    if (next.kind === "MANUAL")
      await notifyAdmins(
        {
          level: "INFO",
          kind: "backup.done",
          title: "Backup listo",
          body: `Ya podés descargarlo: ${files.dbFile}${files.uploadsFile ? " (+ imágenes)" : ""}.`,
          href: "/admin/backups",
          dedupeKey: `backup.done:${next.id}`,
        },
        now,
        db,
      );
    return { ran: 1, stuck: stuck.count };
  } catch (err) {
    const message = (err as Error).message.slice(0, 1000);
    await db.backup.update({ where: { id: next.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
    logger.error({ backupId: next.id, err }, "backup falló");
    await notifyAdmins(
      {
        level: "CRITICAL",
        kind: "backup.failed",
        title: "Falló un backup",
        body: message.slice(0, 300),
        href: "/admin/backups",
        dedupeKey: `backup.failed:${next.id}`,
      },
      now,
      db,
    );
    return { ran: 1, stuck: stuck.count, failed: 1 };
  }
}

/** Tarea `backup-nightly`: programa el backup diario (una vez por día aunque el worker se reinicie) y lo ejecuta. */
export async function scheduleNightlyBackup(now = new Date(), db: Db = prisma) {
  const recent = await db.backup.findFirst({
    where: { kind: "SCHEDULED", createdAt: { gt: new Date(now.getTime() - NIGHTLY_MIN_GAP_MS) } },
  });
  const busy = await db.backup.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (!recent && !busy) await db.backup.create({ data: { kind: "SCHEDULED" } });
  const ran = await runPendingBackups(now, db);
  const pruned = await pruneBackups(now, db);
  return { ...ran, ...pruned };
}

/** Borra backups (archivos y filas) de más de `BACKUP_RETENTION_DAYS`; los manuales duran el doble. */
export async function pruneBackups(now = new Date(), db: Db = prisma) {
  const days = retentionDays();
  const old = await db.backup.findMany({
    where: {
      status: { in: ["DONE", "FAILED"] },
      OR: [
        { kind: "SCHEDULED", createdAt: { lt: new Date(now.getTime() - days * DAY) } },
        { kind: "MANUAL", createdAt: { lt: new Date(now.getTime() - 2 * days * DAY) } },
      ],
    },
  });
  for (const b of old) {
    for (const f of [b.dbFile, b.uploadsFile]) {
      if (!f) continue;
      await unlink(backupFilePath(f)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
    }
    await db.backup.delete({ where: { id: b.id } });
  }
  return { pruned: old.length };
}
