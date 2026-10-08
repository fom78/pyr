import { prisma } from "@/server/db";

/** Opciones del selector "Pertenece a": categorías (liga) y torneos no terminados. */
export async function quizRefOptions() {
  const [categories, tournaments] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    prisma.tournament.findMany({
      where: { status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: { startsAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);
  return [
    ...categories.map((c) => ({ value: `c:${c.id}`, label: `${c.icon ?? ""} ${c.name} (liga)`.trim() })),
    ...tournaments.map((t) => ({ value: `t:${t.id}`, label: `🏆 ${t.name} (torneo)` })),
  ];
}
