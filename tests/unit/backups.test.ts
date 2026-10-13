import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { backupEnvName, backupFileNames, dumpCommand, isBackupFileName } from "@/server/backups/commands";
import { splitTarPath, tarHeader, writeTarGz } from "@/server/backups/tar";

describe("backups: comando de pg_dump", () => {
  it("arma el comando desde DATABASE_URL sin poner el password en los argumentos", () => {
    const c = dumpCommand({ DATABASE_URL: "postgresql://pyr:s3cr%40to@db:5432/pyr?schema=public" });
    expect(c.cmd).toBe("pg_dump");
    expect(c.args).toEqual(["--no-owner", "--no-privileges", "-h", "db", "-p", "5432", "-U", "pyr", "-d", "pyr"]);
    expect(c.env).toEqual({ PGPASSWORD: "s3cr@to" });
    expect(c.args.join(" ")).not.toContain("s3cr");
  });

  it("respeta el override (pg_dump del contenedor en Windows)", () => {
    const c = dumpCommand({ DATABASE_URL: "postgresql://x@h/db", BACKUP_PG_DUMP: "docker compose exec -T db pg_dump -U pyr pyr" });
    expect(c).toEqual({ cmd: "docker", args: ["compose", "exec", "-T", "db", "pg_dump", "-U", "pyr", "pyr"], env: {} });
  });

  it("falla claro sin base", () => {
    expect(() => dumpCommand({})).toThrow("DATABASE_URL");
  });
});

describe("backups: nombres", () => {
  it("entorno: APP_ENV manda; si no, se deduce de APP_URL", () => {
    expect(backupEnvName({ APP_ENV: "Prod" })).toBe("prod");
    expect(backupEnvName({ APP_URL: "http://localhost:3200" })).toBe("local");
    expect(backupEnvName({ APP_URL: "https://dev.trivia.com" })).toBe("dev");
    expect(backupEnvName({ APP_URL: "https://trivia-staging.com" })).toBe("dev");
    expect(backupEnvName({ APP_URL: "https://trivia.com" })).toBe("prod");
    expect(backupEnvName({})).toBe("local");
  });

  it("archivos con fecha de Buenos Aires y validación estricta del nombre", () => {
    const n = backupFileNames("prod", new Date("2026-10-13T06:30:05Z"));
    expect(n).toEqual({ db: "pyr-prod-20261013-033005.sql.gz", uploads: "pyr-prod-20261013-033005-uploads.tar.gz" });
    expect(isBackupFileName(n.db)).toBe(true);
    expect(isBackupFileName(n.uploads)).toBe(true);
    expect(isBackupFileName("../etc/passwd")).toBe(false);
    expect(isBackupFileName("pyr-prod-20261013-033005.sql.gz/../x")).toBe(false);
  });
});

describe("backups: tar", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pyr-tar-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("encabezado ustar con checksum válido", () => {
    const h = tarHeader({ path: "covers/2026/10/a.webp", size: 1234, mtime: new Date(1_700_000_000_000) });
    expect(h.length).toBe(512);
    expect(h.toString("ascii", 0, 21)).toBe("covers/2026/10/a.webp");
    expect(h.toString("ascii", 257, 262)).toBe("ustar");
    expect(parseInt(h.toString("ascii", 124, 135), 8)).toBe(1234);
    const stored = parseInt(h.toString("ascii", 148, 154), 8);
    const copy = Buffer.from(h);
    copy.fill(0x20, 148, 156);
    expect(stored).toBe(copy.reduce((a, b) => a + b, 0));
  });

  it("rutas largas van a prefix + name", () => {
    const long = `${"a".repeat(80)}/${"b".repeat(60)}/c.webp`;
    const { name, prefix } = splitTarPath(long);
    expect(`${prefix}/${name}`).toBe(long);
    expect(name.length).toBeLessThanOrEqual(100);
  });

  it("el .tar.gz se lee con el tar del sistema", () => {
    const src = path.join(dir, "src");
    mkdirSync(path.join(src, "covers/2026"), { recursive: true });
    writeFileSync(path.join(src, "covers/2026/x.webp"), Buffer.alloc(700, 7));
    writeFileSync(path.join(src, "raiz.txt"), "hola");
    const out = path.join(dir, "out.tar.gz");
    return writeTarGz(src, out).then(() => {
      // Rutas relativas: el tar de Git en Windows toma "C:\…" como un host remoto.
      const list = execFileSync("tar", ["-tzf", "out.tar.gz"], { cwd: dir }).toString().trim().split("\n");
      expect(list).toEqual(["covers/", "covers/2026/", "covers/2026/x.webp", "raiz.txt"]);
      const dest = path.join(dir, "dest");
      mkdirSync(dest);
      execFileSync("tar", ["-xzf", "out.tar.gz", "-C", "dest"], { cwd: dir });
      expect(readFileSync(path.join(dest, "covers/2026/x.webp"))).toEqual(Buffer.alloc(700, 7));
      expect(readFileSync(path.join(dest, "raiz.txt"), "utf8")).toBe("hola");
    });
  });
});
