import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { authorize } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { apiError } from "@/server/api";
import { logAudit } from "@/server/audit";
import { backupFilePath } from "@/server/backups/service";

/** Descarga un archivo de backup (solo admin). El nombre sale de la DB, nunca de la URL. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; part: string }> }) {
  try {
    const user = await authorize("backup.manage");
    const { id, part } = await ctx.params;
    const backup = await prisma.backup.findUnique({ where: { id } });
    const name = part === "db" ? backup?.dbFile : part === "uploads" ? backup?.uploadsFile : null;
    if (!backup || backup.status !== "DONE" || !name) return new Response("Not found", { status: 404 });
    const file = backupFilePath(name);
    const info = await stat(file).catch(() => null);
    if (!info) return new Response("El archivo ya no está en el servidor.", { status: 410 });
    await logAudit({ actorId: user.id, action: "backup.download", entityType: "Backup", entityId: id, meta: { file: name } });
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(info.size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
