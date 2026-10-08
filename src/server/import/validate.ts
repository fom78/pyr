import { normalizeText } from "@/lib/text";
import { questionInput, type QuestionInput } from "@/server/questions/schema";

/** Columnas de la plantilla (en orden). El encabezado se compara normalizado (sin acentos/mayúsculas). */
export const TEMPLATE_COLUMNS = [
  { key: "categoria", header: "Categoría", width: 16, note: "Nombre o slug de una categoría existente. Varias separadas por coma." },
  { key: "pregunta", header: "Pregunta", width: 50, note: "Enunciado. Puede quedar vacío si la pregunta es solo imagen." },
  { key: "opcion_1", header: "Opción 1", width: 20 },
  { key: "opcion_2", header: "Opción 2", width: 20 },
  { key: "opcion_3", header: "Opción 3", width: 20 },
  { key: "opcion_4", header: "Opción 4", width: 20 },
  { key: "opcion_5", header: "Opción 5", width: 20, note: "Opcional." },
  { key: "correcta", header: "Correcta", width: 10, note: "Número de la opción correcta (1 a 5)." },
  { key: "dificultad", header: "Dificultad", width: 10, note: "1 (muy fácil) a 5 (muy difícil). Por defecto 2." },
  { key: "etiquetas", header: "Etiquetas", width: 18, note: "Separadas por coma." },
  { key: "imagen", header: "Imagen", width: 24, note: "URL (https://…) o nombre de archivo dentro del .zip." },
  { key: "explicacion", header: "Explicación", width: 40, note: "Opcional. Se muestra al revisar respuestas." },
] as const;

export type ColumnKey = (typeof TEMPLATE_COLUMNS)[number]["key"];
export type RawRow = Partial<Record<ColumnKey, string>>;

export type ValidatedRow = {
  row: number; // número de fila en el Excel (1-based, contando el encabezado)
  raw: RawRow;
  input?: Omit<QuestionInput, "imageKey"> & { imageKey?: string };
  imageRef?: { kind: "url" | "zip"; value: string };
  errors: string[];
  warnings: string[];
};

export type ValidationContext = {
  categories: { id: string; name: string; slug: string }[];
  zipFiles: Set<string>; // nombres de archivo (en minúsculas, sin carpetas)
};

export function headerToKey(header: string): ColumnKey | undefined {
  const n = normalizeText(header).replace(/\s+/g, "_");
  const alias: Record<string, ColumnKey> = {
    categoria: "categoria",
    categorias: "categoria",
    pregunta: "pregunta",
    enunciado: "pregunta",
    correcta: "correcta",
    respuesta_correcta: "correcta",
    dificultad: "dificultad",
    etiquetas: "etiquetas",
    tags: "etiquetas",
    imagen: "imagen",
    explicacion: "explicacion",
  };
  if (alias[n]) return alias[n];
  const m = n.match(/^opcion_?([1-5])$/);
  return m ? (`opcion_${m[1]}` as ColumnKey) : undefined;
}

export function baseName(path: string) {
  return path.split(/[\\/]/).pop()!.toLowerCase();
}

/** Valida una fila (pura, sin IO). La imagen se resuelve después. */
export function validateRow(rowNumber: number, raw: RawRow, ctx: ValidationContext): ValidatedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prefix = `Fila ${rowNumber}`;

  // Categorías
  const catNames = (raw.categoria ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const categoryIds: string[] = [];
  if (!catNames.length) errors.push(`${prefix}: falta la categoría.`);
  for (const name of catNames) {
    const n = normalizeText(name);
    const cat = ctx.categories.find((c) => normalizeText(c.name) === n || c.slug === name.toLowerCase());
    if (cat) categoryIds.push(cat.id);
    else errors.push(`${prefix}: la categoría "${name}" no existe.`);
  }

  // Opciones: se toman las no vacías, en orden. La "correcta" se refiere a la columna original.
  const optionCols = [raw.opcion_1, raw.opcion_2, raw.opcion_3, raw.opcion_4, raw.opcion_5];
  const filled = optionCols.map((v, i) => ({ text: (v ?? "").trim(), col: i + 1 })).filter((o) => o.text);
  if (filled.length < 4) errors.push(`${prefix}: tiene ${filled.length} opciones; se necesitan entre 4 y 5.`);
  const correctCol = Number((raw.correcta ?? "").trim());
  let correctIndex = -1;
  if (!raw.correcta?.trim()) errors.push(`${prefix}: falta la opción correcta.`);
  else if (!Number.isInteger(correctCol) || correctCol < 1 || correctCol > 5)
    errors.push(`${prefix}: "Correcta" debe ser un número del 1 al 5.`);
  else {
    correctIndex = filled.findIndex((o) => o.col === correctCol);
    if (correctIndex < 0) errors.push(`${prefix}: la opción correcta (${correctCol}) está vacía.`);
  }

  // Imagen
  let imageRef: ValidatedRow["imageRef"];
  const img = (raw.imagen ?? "").trim();
  if (img) {
    if (/^https?:\/\//i.test(img)) imageRef = { kind: "url", value: img };
    else if (ctx.zipFiles.has(baseName(img))) imageRef = { kind: "zip", value: baseName(img) };
    else errors.push(`${prefix}: la imagen "${img}" no está en el .zip ni es una URL.`);
  }

  const text = (raw.pregunta ?? "").trim();
  if (!text && !img) errors.push(`${prefix}: falta el texto de la pregunta.`);

  const difficulty = raw.dificultad?.trim() ? Number(raw.dificultad) : 2;
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) errors.push(`${prefix}: la dificultad debe ser del 1 al 5.`);

  if (errors.length) return { row: rowNumber, raw, errors, warnings };

  const candidate = {
    type: img ? (text ? "IMAGE_TEXT" : "IMAGE") : "TEXT",
    text: text || undefined,
    // placeholder para validar el schema; se reemplaza por el key real al procesar la imagen
    imageKey: img ? "pending" : undefined,
    difficulty,
    explanation: raw.explicacion?.trim() || undefined,
    categoryIds,
    tags: (raw.etiquetas ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    shuffleOptions: null,
    options: filled.map((o) => ({ text: o.text })),
    correctIndex,
  };
  const parsed = questionInput.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${prefix}: ${issue.message}`);
    return { row: rowNumber, raw, errors, warnings };
  }
  const { imageKey: _ignored, ...rest } = parsed.data;
  void _ignored;
  return { row: rowNumber, raw, input: rest, imageRef, errors, warnings };
}

/** Marca como advertencia las preguntas repetidas dentro del mismo archivo. */
export function flagInFileDuplicates(rows: ValidatedRow[]) {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = normalizeText(r.raw.pregunta);
    if (!key) continue;
    const first = seen.get(key);
    if (first) r.warnings.push(`Fila ${r.row}: es igual a la fila ${first} del mismo archivo.`);
    else seen.set(key, r.row);
  }
  return rows;
}
