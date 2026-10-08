import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { prisma } from "@/server/db";
import { buildTemplate, commitImport, previewImport } from "@/server/import/excel";
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
});
