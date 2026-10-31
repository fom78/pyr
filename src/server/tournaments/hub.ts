import { prisma, type Db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { groupTournaments } from "./listing";

/** Lo que muestra una tarjeta de torneo en `/torneos`. */
export const tournamentCardInclude = {
  categories: { include: { category: true } },
  _count: { select: { entries: true } },
  qualifiers: { select: { fromRank: true, topN: true } },
  seasonRun: { select: { number: true, season: { select: { name: true } } } },
} satisfies Prisma.TournamentInclude;

export type TournamentCardData = Prisma.TournamentGetPayload<{ include: typeof tournamentCardInclude }>;

export const FINISHED_PAGE_SIZE = 12;

/** Datos de `/torneos`: publicados agrupados por pestaña, finalizados paginados y temporadas. */
export async function getTournamentsHub(
  userId: string,
  opts: { now?: Date; finishedPage?: number; onlyMine?: boolean } = {},
  db: Db = prisma,
) {
  const now = opts.now ?? new Date();
  const page = Math.max(1, opts.finishedPage ?? 1);
  const finishedWhere: Prisma.TournamentWhereInput = {
    status: "FINISHED",
    ...(opts.onlyMine ? { entries: { some: { userId } } } : {}),
  };
  const [published, entries, finished, finishedTotal, runs] = await Promise.all([
    // Los publicados son pocos a la vez (los terminados pasan a FINISHED): se traen todos y se agrupan en TS.
    db.tournament.findMany({ where: { status: "PUBLISHED" }, include: tournamentCardInclude }),
    db.tournamentEntry.findMany({ where: { userId, tournament: { status: "PUBLISHED" } }, select: { tournamentId: true } }),
    db.tournament.findMany({
      where: finishedWhere,
      orderBy: { endsAt: "desc" },
      skip: (page - 1) * FINISHED_PAGE_SIZE,
      take: FINISHED_PAGE_SIZE,
      include: tournamentCardInclude,
    }),
    db.tournament.count({ where: finishedWhere }),
    // Temporadas: la instancia en curso o, si no hay, la última terminada de cada una.
    db.seasonRun.findMany({
      where: { status: { in: ["ACTIVE", "FINISHED"] }, season: { status: { not: "ARCHIVED" } } },
      orderBy: [{ status: "asc" }, { number: "desc" }],
      include: {
        season: { select: { name: true, slug: true, description: true, imageKey: true } },
        tournaments: { where: { status: { not: "DRAFT" } }, select: { format: true } },
      },
    }),
  ]);
  const mine = new Set(entries.map((e) => e.tournamentId));
  const results = finished.length
    ? await db.tournamentResult.findMany({
        where: { userId, tournamentId: { in: finished.map((t) => t.id) } },
        select: { tournamentId: true, rank: true },
      })
    : [];
  const seen = new Set<string>();
  const seasons = runs.filter((r) => (seen.has(r.seasonId) ? false : (seen.add(r.seasonId), true)));
  return {
    groups: groupTournaments(published, mine, now),
    mine,
    finished: { items: finished, total: finishedTotal, page, pages: Math.max(1, Math.ceil(finishedTotal / FINISHED_PAGE_SIZE)) },
    ranks: new Map(results.map((r) => [r.tournamentId, r.rank])),
    seasons,
  };
}
