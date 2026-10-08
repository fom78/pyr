import { z } from "zod";
import { prisma, type Db } from "@/server/db";
import { slugify } from "@/lib/text";
import { logAudit } from "@/server/audit";
import { UserError } from "@/server/errors";
import { categoryOverridableKeys, settingsRegistry, type SettingKey } from "@/server/config/registry";

export const categoryInput = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres.").max(60),
  slug: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9-]*$/, "Solo minúsculas, números y guiones.")
    .optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(16).optional(),
  imageKey: z.string().trim().max(300).optional(),
  active: z.boolean().default(true),
  frequencyDays: z.coerce.number().int().min(1).max(60).nullable().optional(),
  /** Overrides de configuración (solo keys marcadas como categoryOverride). Vacío = hereda global. */
  settings: z.record(z.string(), z.unknown()).default({}),
});

export type CategoryInput = z.infer<typeof categoryInput>;

function cleanOverrides(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === "" || v === null || v === undefined) continue;
    if (!categoryOverridableKeys.includes(k as SettingKey)) continue;
    const def = settingsRegistry[k as SettingKey];
    const parsed = def.schema.safeParse(typeof v === "string" && !isNaN(Number(v)) ? Number(v) : v);
    if (!parsed.success) throw new UserError(`Valor inválido para "${def.label}".`);
    out[k] = parsed.data;
  }
  return out;
}

export async function saveCategory(id: string | null, raw: unknown, actor: { id: string }, db: Db = prisma) {
  const input = categoryInput.parse(raw);
  const slug = input.slug || slugify(input.name);
  const clash = await db.category.findFirst({ where: { slug, NOT: id ? { id } : undefined } });
  if (clash) throw new UserError("Ya existe una categoría con ese identificador (slug).");
  const data = {
    name: input.name,
    slug,
    description: input.description || null,
    icon: input.icon || null,
    imageKey: input.imageKey || null,
    active: input.active,
    frequencyDays: input.frequencyDays ?? null,
    settings: cleanOverrides(input.settings) as object,
  };
  const before = id ? await db.category.findUnique({ where: { id } }) : null;
  const cat = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
  await logAudit(
    { actorId: actor.id, action: id ? "category.update" : "category.create", entityType: "Category", entityId: cat.id, before, after: data },
    db,
  );
  return cat;
}

export async function listCategoriesWithStats(db: Db = prisma) {
  return db.category.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          questions: true,
          quizzes: true,
          memberships: { where: { status: "ACTIVE" } },
        },
      },
    },
  });
}
