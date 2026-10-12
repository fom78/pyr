import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { prisma } from "@/server/db";
import { buildTemplate, commitImport, previewImport } from "@/server/import/excel";
import { approveQuestions, buildQuestionWhere } from "@/server/questions/service";
import { hasDb, makeCategory, makeUser, resetDb } from "./helpers";

async function fillTemplate(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildTemplate([{ name: "Cine" }])) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  // pisa la fila de ejemplo y escribe desde la fila 2 (como haría un usuario)
  rows.forEach((r, i) => {
    ws.getRow(i + 2).values = r;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe.skipIf(!hasDb)("importación Excel", () => {
  beforeEach(resetDb);

  it("previsualiza con errores por fila e importa solo las válidas como pendientes", async () => {
    await makeCategory("cine");
    const mod = await makeUser("MOD");
    const xlsx = await fillTemplate([
      ["Cine", "¿Quién dirigió Tiburón?", "Spielberg", "Lucas", "Coppola", "Scorsese", "", 1, 2, "clásicos", "", ""],
      ["Cine", "Sin correcta", "a", "b", "c", "d", "", "", 2, "", "", ""],
      ["Historia", "Categoría mala", "a", "b", "c", "d", "", 1, 2, "", "", ""],
    ]);
    const job = await previewImport({ authorId: mod.id, fileName: "x.xlsx", xlsx, autoApprove: false });
    expect(job.validCount).toBe(1);
    expect(job.invalidCount).toBe(2);
    const rows = job.rows as unknown as { row: number; errors: string[] }[];
    expect(rows[1].errors).toContain("Fila 3: falta la opción correcta.");

    await expect(commitImport(job.id, "all", mod)).rejects.toThrow(/errores/);
    expect(await commitImport(job.id, "valid", mod)).toBe(1);
    const q = await prisma.question.findFirstOrThrow({ include: { options: true, tags: { include: { tag: true } } } });
    expect(q.status).toBe("PENDING_REVIEW");
    expect(q.options.find((o) => o.isCorrect)?.text).toBe("Spielberg");
    expect(q.tags[0].tag.name).toBe("clásicos");
    await expect(commitImport(job.id, "valid", mod)).rejects.toThrow(/ya fue procesada/);
  });

  it("respeta la decisión por fila: no importar, pendiente y parecidas pendientes por defecto", async () => {
    await makeCategory("cine");
    const admin = await makeUser("ADMIN");
    const first = await previewImport({
      authorId: admin.id,
      fileName: "a.xlsx",
      xlsx: await fillTemplate([["Cine", "¿Quién dirigió la película Tiburón en 1975?", "Spielberg", "Lucas", "Coppola", "Scorsese", "", 1, 2, "", "", ""]]),
      autoApprove: true,
    });
    await commitImport(first.id, "all", admin);

    const job = await previewImport({
      authorId: admin.id,
      fileName: "b.xlsx",
      xlsx: await fillTemplate([
        ["Cine", "¿Quién dirigió la película Tiburón en 1975?", "Spielberg", "Lucas", "Coppola", "Scorsese", "", 1, 2, "", "", ""],
        ["Cine", "¿En qué año se estrenó Titanic?", "1997", "1995", "1999", "2001", "", 1, 2, "", "", ""],
        ["Cine", "¿Quién protagonizó Rocky?", "Stallone", "De Niro", "Pacino", "Hoffman", "", 1, 2, "", "", ""],
      ]),
      autoApprove: true,
    });
    const rows = job.rows as unknown as { row: number; similar?: { id: string }[] }[];
    expect(rows[0].similar?.length).toBeGreaterThan(0);

    expect(await commitImport(job.id, "all", admin, { 3: "pending", 4: "skip" })).toBe(2);
    const created = await prisma.question.findMany({ where: { NOT: { text: { contains: "Rocky" } } }, orderBy: { createdAt: "asc" } });
    expect(created.map((q) => q.status)).toEqual(["APPROVED", "PENDING_REVIEW", "PENDING_REVIEW"]);

    // Sin "aprobar directamente" se puede aprobar por fila si el actor tiene permiso; si no, queda pendiente.
    const other = await previewImport({
      authorId: admin.id,
      fileName: "d.xlsx",
      xlsx: await fillTemplate([
        ["Cine", "¿Quién dirigió Pulp Fiction?", "Tarantino", "Scorsese", "Nolan", "Fincher", "", 1, 2, "", "", ""],
        ["Cine", "¿Quién dirigió Amélie?", "Jeunet", "Besson", "Ozon", "Audiard", "", 1, 2, "", "", ""],
      ]),
      autoApprove: false,
    });
    await commitImport(other.id, "valid", admin, { 2: "approve" }, { canApprove: true });
    expect((await prisma.question.findFirstOrThrow({ where: { text: { contains: "Pulp" } } })).status).toBe("APPROVED");
    expect((await prisma.question.findFirstOrThrow({ where: { text: { contains: "Amélie" } } })).status).toBe("PENDING_REVIEW");
    expect(await prisma.question.count({ where: { text: { contains: "Rocky" } } })).toBe(0);
    const stored = (await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })).rows as unknown as {
      createdId?: string;
      decision?: string;
    }[];
    expect(stored.map((r) => r.decision)).toEqual(["pending", "pending", "skip"]);
    expect(stored[0].createdId).toBeTruthy();
    expect(stored[2].createdId).toBeUndefined();
  });

  it("aprueba en masa solo las no aprobadas ni archivadas que cumplen el filtro", async () => {
    await makeCategory("cine");
    const mod = await makeUser("MOD");
    const job = await previewImport({
      authorId: mod.id,
      fileName: "c.xlsx",
      xlsx: await fillTemplate([
        ["Cine", "¿Quién dirigió Alien en 1979?", "Scott", "Cameron", "Fincher", "Lynch", "", 1, 2, "", "", ""],
        ["Cine", "¿Quién compuso la música de Star Wars?", "Williams", "Zimmer", "Morricone", "Shore", "", 1, 3, "", "", ""],
        ["Cine", "¿Qué estudio hizo Toy Story?", "Pixar", "DreamWorks", "Disney", "Ghibli", "", 1, 2, "", "", ""],
      ]),
      autoApprove: false,
    });
    await commitImport(job.id, "valid", mod);
    await prisma.question.updateMany({ where: { text: { contains: "Toy Story" } }, data: { archived: true } });

    expect(await approveQuestions(buildQuestionWhere({ difficulty: 2, includeArchived: true }), mod)).toBe(1);
    const byText = Object.fromEntries((await prisma.question.findMany()).map((q) => [q.text, q.status]));
    expect(byText["¿Quién dirigió Alien en 1979?"]).toBe("APPROVED");
    expect(byText["¿Quién compuso la música de Star Wars?"]).toBe("PENDING_REVIEW");
    expect(byText["¿Qué estudio hizo Toy Story?"]).toBe("PENDING_REVIEW");
    expect(await prisma.auditLog.count({ where: { action: "question.bulkApprove" } })).toBe(1);
  });
});
