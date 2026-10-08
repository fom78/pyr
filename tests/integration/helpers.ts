import { prisma } from "@/server/db";
import { invalidateSettingsCache } from "@/server/config/service";
import type { Role } from "@/generated/prisma/enums";

export const hasDb = Boolean(process.env.TEST_DATABASE_URL);

/** Vacía todas las tablas de la base de test. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  invalidateSettingsCache();
}

let n = 0;
export async function makeUser(role: Role = "USER", name?: string) {
  n++;
  const username = name ?? `user${n}_${Date.now() % 100000}`;
  return prisma.user.create({ data: { username, name: username, email: `${username}@test.invalid`, role } });
}

export async function makeCategory(slug = `cat${++n}`) {
  return prisma.category.create({ data: { slug, name: slug.toUpperCase() } });
}

/** Crea N preguntas aprobadas en la categoría. Opción correcta = posición 0. */
export async function makeQuestions(categoryId: string, count: number) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(
      await prisma.question.create({
        data: {
          text: `Pregunta ${i} ${categoryId}`,
          normalizedText: `pregunta ${i}`,
          status: "APPROVED",
          categories: { create: { categoryId } },
          options: { create: [0, 1, 2, 3].map((p) => ({ position: p, text: `Op ${p}`, isCorrect: p === 0 })) },
        },
        include: { options: true },
      }),
    );
  }
  return out;
}
