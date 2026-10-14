import { prisma, type Db } from "@/server/db";
import { summarizeResults } from "./tournament-summary";

/** Resumen y últimos resultados de torneos del jugador (de `TournamentResult`: permanentes). */
export async function getTournamentStats(userId: string, db: Db = prisma) {
  const rows = await db.tournamentResult.findMany({
    where: { userId },
    orderBy: { finishedAt: "desc" },
    select: {
      tournamentId: true,
      rank: true,
      participants: true,
      points: true,
      prizeCredits: true,
      quizzesPlayed: true,
      quizzesTotal: true,
      tournamentName: true,
      finishedAt: true,
      tournament: { select: { slug: true } },
    },
  });
  return { summary: summarizeResults(rows), recent: rows.slice(0, 5) };
}

/** Todos los resultados, paginados (para /perfil/torneos). */
export async function listTournamentResults(userId: string, page: number, pageSize: number, db: Db = prisma) {
  const [total, rows] = await Promise.all([
    db.tournamentResult.count({ where: { userId } }),
    db.tournamentResult.findMany({
      where: { userId },
      orderBy: { finishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { tournament: { select: { slug: true } } },
    }),
  ]);
  return { total, rows };
}
