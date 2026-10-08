import ExcelJS from "exceljs";
import JSZip from "jszip";
import { prisma } from "@/server/db";
import { UserError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { createQuestion, findSimilarQuestions } from "@/server/questions/service";
import { processAndStoreImage } from "@/server/storage/images";
import { logger } from "@/server/logger";
import type { Prisma } from "@/generated/prisma/client";
import {
  baseName,
  flagInFileDuplicates,
  headerToKey,
  TEMPLATE_COLUMNS,
  validateRow,
  type RawRow,
  type ValidatedRow,
} from "./validate";

const MAX_ROWS = 1000;
const MAX_URL_IMAGE_BYTES = 8 * 1024 * 1024;

/** Plantilla .xlsx descargable con una fila de ejemplo y una hoja de instrucciones. */
export async function buildTemplate(categories: { name: string }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PyR";
  const ws = wb.addWorksheet("Preguntas", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  TEMPLATE_COLUMNS.forEach((c, i) => {
    if ("note" in c && c.note) ws.getCell(1, i + 1).note = c.note;
  });
  ws.addRow({
    categoria: categories[0]?.name ?? "Fútbol",
    pregunta: "¿Qué selección ganó el Mundial de Qatar 2022?",
    opcion_1: "Francia",
    opcion_2: "Argentina",
    opcion_3: "Brasil",
    opcion_4: "Croacia",
    correcta: 2,
    dificultad: 1,
    etiquetas: "mundiales, argentina",
    imagen: "",
    explicacion: "Argentina le ganó la final a Francia por penales.",
  });
  for (let r = 2; r <= MAX_ROWS + 1; r++) {
    ws.getCell(`H${r}`).dataValidation = { type: "whole", operator: "between", formulae: [1, 5], allowBlank: true, showErrorMessage: true, error: "Del 1 al 5" };
    ws.getCell(`I${r}`).dataValidation = { type: "whole", operator: "between", formulae: [1, 5], allowBlank: true, showErrorMessage: true, error: "Del 1 al 5" };
  }

  const help = wb.addWorksheet("Instrucciones");
  help.getColumn(1).width = 110;
  [
    "Cómo completar la plantilla",
    "",
    "• Una fila por pregunta. No cambies los encabezados de la hoja 'Preguntas'. Borrá la fila de ejemplo.",
    "• Cada pregunta necesita entre 4 y 5 opciones y exactamente una correcta (columna 'Correcta' = número de opción).",
    "• Categoría: escribí el nombre tal cual figura en la app. Para varias, separalas con coma.",
    "• Imágenes: poné una URL (https://…) o el nombre del archivo y subí un .zip con las imágenes junto al Excel.",
    `• Máximo ${MAX_ROWS} filas por archivo.`,
    "• Las preguntas importadas quedan 'Pendientes de revisión' (salvo que un admin elija aprobarlas al importar).",
    "",
    "Categorías disponibles: " + categories.map((c) => c.name).join(", "),
  ].forEach((line, i) => {
    help.getCell(i + 1, 1).value = line;
    if (i === 0) help.getCell(i + 1, 1).font = { bold: true, size: 14 };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return v.result === undefined ? "" : String(v.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

async function readRows(xlsx: Buffer): Promise<{ row: number; raw: RawRow }[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(xlsx as unknown as ArrayBuffer);
  } catch {
    throw new UserError("No se pudo leer el archivo. ¿Es un .xlsx válido?");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new UserError("El archivo no tiene hojas.");
  const header = ws.getRow(1);
  const map = new Map<number, keyof RawRow>();
  header.eachCell((cell, col) => {
    const key = headerToKey(cellText(cell.value));
    if (key) map.set(col, key);
  });
  if (![...map.values()].includes("pregunta") || ![...map.values()].includes("correcta"))
    throw new UserError("No encontramos los encabezados de la plantilla (Pregunta, Opción 1…, Correcta). Descargá la plantilla y usala como base.");
  const out: { row: number; raw: RawRow }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: RawRow = {};
    map.forEach((key, col) => {
      const t = cellText(row.getCell(col).value);
      if (t) raw[key] = t;
    });
    if (Object.keys(raw).length) out.push({ row: rowNumber, raw });
  });
  if (out.length > MAX_ROWS) throw new UserError(`El archivo tiene ${out.length} filas; el máximo es ${MAX_ROWS}.`);
  if (!out.length) throw new UserError("El archivo no tiene filas con datos.");
  return out;
}

async function fetchImage(url: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_URL_IMAGE_BYTES) throw new Error("demasiado grande");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_URL_IMAGE_BYTES) throw new Error("demasiado grande");
    return buf;
  } finally {
    clearTimeout(t);
  }
}

export type StoredRow = ValidatedRow & { imageKey?: string; similar?: { id: string; text: string | null; similarity: number }[] };

/**
 * Lee el Excel (+ zip opcional), valida fila por fila, procesa imágenes y guarda una previsualización (ImportJob).
 * Nada se crea como pregunta hasta confirmar.
 */
export async function previewImport(params: { authorId: string; fileName: string; xlsx: Buffer; zip?: Buffer; autoApprove: boolean }) {
  const [rawRows, categories] = await Promise.all([
    readRows(params.xlsx),
    prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  let zipFiles = new Map<string, JSZip.JSZipObject>();
  if (params.zip) {
    try {
      const zip = await JSZip.loadAsync(params.zip);
      zipFiles = new Map(
        Object.values(zip.files)
          .filter((f) => !f.dir && /\.(png|jpe?g|webp|gif)$/i.test(f.name))
          .map((f) => [baseName(f.name), f]),
      );
    } catch {
      throw new UserError("No se pudo abrir el .zip de imágenes.");
    }
  }

  const ctx = { categories, zipFiles: new Set(zipFiles.keys()) };
  const rows: StoredRow[] = flagInFileDuplicates(rawRows.map((r) => validateRow(r.row, r.raw, ctx)));

  for (const r of rows) {
    if (r.errors.length || !r.input) continue;
    if (r.imageRef) {
      try {
        const buf =
          r.imageRef.kind === "zip" ? Buffer.from(await zipFiles.get(r.imageRef.value)!.async("uint8array")) : await fetchImage(r.imageRef.value);
        r.imageKey = await processAndStoreImage(buf, "question");
      } catch (err) {
        logger.warn({ err, row: r.row }, "imagen de importación inválida");
        r.errors.push(`Fila ${r.row}: no se pudo procesar la imagen (${(err as Error).message}).`);
        continue;
      }
    }
    if (r.input.text) {
      const similar = await findSimilarQuestions(r.input.text, { limit: 3 });
      if (similar.length) {
        r.similar = similar.map((s) => ({ id: s.id, text: s.text, similarity: s.similarity }));
        r.warnings.push(`Fila ${r.row}: se parece a una pregunta existente (${Math.round(similar[0].similarity * 100)}%).`);
      }
    }
  }

  const validCount = rows.filter((r) => !r.errors.length).length;
  return prisma.importJob.create({
    data: {
      authorId: params.authorId,
      fileName: params.fileName,
      rows: JSON.parse(JSON.stringify(rows)) as Prisma.InputJsonValue,
      validCount,
      invalidCount: rows.length - validCount,
      autoApprove: params.autoApprove,
    },
  });
}

/** Confirma una importación. mode "valid" = solo filas válidas; "all" = todo o nada. */
export async function commitImport(jobId: string, mode: "valid" | "all", actor: { id: string }) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.authorId !== actor.id) throw new UserError("Importación no encontrada.");
  if (job.status !== "PREVIEW") throw new UserError("Esta importación ya fue procesada.");
  if (mode === "all" && job.invalidCount > 0) throw new UserError("Hay filas con errores: corregí el archivo o importá solo las válidas.");
  const rows = (job.rows as unknown as StoredRow[]).filter((r) => !r.errors.length && r.input);

  const created = await prisma.$transaction(
    async (tx) => {
      let n = 0;
      for (const r of rows) {
        await createQuestion({ ...r.input, imageKey: r.imageKey }, actor, { approve: job.autoApprove }, tx);
        n++;
      }
      await tx.importJob.update({ where: { id: jobId }, data: { status: "COMMITTED", createdCount: n, committedAt: new Date() } });
      return n;
    },
    { timeout: 120_000 },
  );
  await logAudit({ actorId: actor.id, action: "question.import", entityType: "ImportJob", entityId: jobId, meta: { created, autoApprove: job.autoApprove } });
  return created;
}

export async function discardImport(jobId: string, actor: { id: string }) {
  await prisma.importJob.updateMany({ where: { id: jobId, authorId: actor.id, status: "PREVIEW" }, data: { status: "DISCARDED" } });
}
