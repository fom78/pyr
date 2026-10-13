import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { pruneBackups, requestBackup, runPendingBackups } from "@/server/backups/service";
import { hasDb, makeUser, resetDb } from "./helpers";

const DAY = 86_400_000;

describe.skipIf(!hasDb)("backups", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pyr-bk-"));
  const prev = { dir: process.env.BACKUP_DIR, cmd: process.env.BACKUP_PG_DUMP };
  beforeEach(async () => {
    await resetDb();
    process.env.BACKUP_DIR = dir;
  });
  afterAll(() => {
    process.env.BACKUP_DIR = prev.dir;
    process.env.BACKUP_PG_DUMP = prev.cmd;
    rmSync(dir, { recursive: true, force: true });
  });

  it("no acepta dos pedidos a la vez; un backup colgado pasa a FAILED", async () => {
    const admin = await makeUser("ADMIN");
    await requestBackup(admin);
    await expect(requestBackup(admin)).rejects.toThrow("Ya hay un backup en curso");

    await prisma.backup.updateMany({ data: { status: "RUNNING", startedAt: new Date(Date.now() - 2 * 3_600_000) } });
    const r = await runPendingBackups();
    expect(r).toEqual({ ran: 0, stuck: 1 });
    expect((await prisma.backup.findFirstOrThrow()).status).toBe("FAILED");
    await requestBackup(admin); // ya se puede pedir otro
  });

  it("si pg_dump falla queda FAILED con el error y avisa solo a los admins", async () => {
    process.env.BACKUP_PG_DUMP = "comando-que-no-existe-pyr";
    const admin = await makeUser("ADMIN");
    await makeUser("MOD"); // no recibe el aviso
    await requestBackup(admin);
    expect(await runPendingBackups()).toMatchObject({ ran: 1, failed: 1 });
    const b = await prisma.backup.findFirstOrThrow();
    expect(b.status).toBe("FAILED");
    expect(b.error).toContain("comando-que-no-existe-pyr");
    const notes = await prisma.notification.findMany({ where: { kind: "backup.failed" } });
    expect(notes.map((n) => n.userId)).toEqual([admin.id]);
    expect(notes[0].level).toBe("CRITICAL");
  });

  it("la retención borra archivos y filas viejas; los manuales duran el doble", async () => {
    const mk = async (kind: "MANUAL" | "SCHEDULED", daysAgo: number, file: string) => {
      writeFileSync(path.join(dir, file), "x");
      return prisma.backup.create({
        data: { kind, status: "DONE", dbFile: file, createdAt: new Date(Date.now() - daysAgo * DAY) },
      });
    };
    await mk("SCHEDULED", 20, "pyr-prod-20260901-033000.sql.gz");
    await mk("MANUAL", 20, "pyr-prod-20260901-120000.sql.gz");
    await mk("SCHEDULED", 2, "pyr-prod-20261011-033000.sql.gz");
    expect(await pruneBackups()).toEqual({ pruned: 1 });
    expect(existsSync(path.join(dir, "pyr-prod-20260901-033000.sql.gz"))).toBe(false);
    expect(existsSync(path.join(dir, "pyr-prod-20260901-120000.sql.gz"))).toBe(true);
    expect(await prisma.backup.count()).toBe(2);
  });
});
