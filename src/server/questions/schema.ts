import { z } from "zod";

export const MIN_OPTIONS = 4;
export const MAX_OPTIONS = 5;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const optionInput = z.object({
  text: optional(300),
  imageKey: optional(300),
});

/** Validación compartida por el editor, la importación Excel y el seed. */
export const questionInput = z
  .object({
    type: z.enum(["TEXT", "IMAGE", "IMAGE_TEXT"]).default("TEXT"),
    text: optional(1000),
    imageKey: optional(300),
    difficulty: z.coerce.number().int().min(1).max(5).default(2),
    explanation: optional(2000),
    source: optional(500),
    categoryIds: z.array(z.string().min(1)).min(1, "Elegí al menos una categoría."),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    shuffleOptions: z.boolean().nullable().default(null),
    options: z
      .array(optionInput)
      .min(MIN_OPTIONS, `Tiene que haber entre ${MIN_OPTIONS} y ${MAX_OPTIONS} opciones.`)
      .max(MAX_OPTIONS, `Tiene que haber entre ${MIN_OPTIONS} y ${MAX_OPTIONS} opciones.`),
    correctIndex: z.coerce.number().int().min(0, "Marcá la opción correcta."),
  })
  .superRefine((q, ctx) => {
    if ((q.type === "TEXT" || q.type === "IMAGE_TEXT") && !q.text)
      ctx.addIssue({ code: "custom", path: ["text"], message: "Escribí el enunciado de la pregunta." });
    if ((q.type === "IMAGE" || q.type === "IMAGE_TEXT") && !q.imageKey)
      ctx.addIssue({ code: "custom", path: ["imageKey"], message: "Este tipo de pregunta necesita una imagen." });
    q.options.forEach((o, i) => {
      if (!o.text && !o.imageKey)
        ctx.addIssue({ code: "custom", path: ["options", i], message: `La opción ${i + 1} está vacía.` });
    });
    if (q.correctIndex >= q.options.length)
      ctx.addIssue({ code: "custom", path: ["correctIndex"], message: "La opción correcta no existe." });
    const texts = q.options.map((o) => o.text?.toLowerCase()).filter(Boolean);
    if (new Set(texts).size !== texts.length)
      ctx.addIssue({ code: "custom", path: ["options"], message: "Hay opciones repetidas." });
  });

export type QuestionInput = z.infer<typeof questionInput>;
