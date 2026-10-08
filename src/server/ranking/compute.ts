import { compareResults } from "@/server/scoring/scoring";

export type AttemptResult = {
  userId: string;
  quizId: string;
  score: number;
  correctCount: number;
  totalTimeMs: number;
  finishedAt: Date | null;
};

export type StandingRow = {
  userId: string;
  rank: number;
  points: number;
  quizzesCounted: number;
  correctCount: number;
  totalTimeMs: number;
  lastFinishedAt: Date | null;
};

function aggregate(userId: string, rows: AttemptResult[]): StandingRow {
  let lastFinishedAt: Date | null = null;
  for (const r of rows) if (r.finishedAt && (!lastFinishedAt || r.finishedAt > lastFinishedAt)) lastFinishedAt = r.finishedAt;
  return {
    userId,
    rank: 0,
    points: rows.reduce((a, r) => a + r.score, 0),
    quizzesCounted: rows.length,
    correctCount: rows.reduce((a, r) => a + r.correctCount, 0),
    totalTimeMs: rows.reduce((a, r) => a + r.totalTimeMs, 0),
    lastFinishedAt,
  };
}

/** Ranking de competición (1, 2, 2, 4) usando el mismo criterio de desempate que un cuestionario. */
function assignRanks(rows: StandingRow[]): StandingRow[] {
  const toResult = (r: StandingRow) => ({
    score: r.points,
    correctCount: r.correctCount,
    totalTimeMs: r.totalTimeMs,
    finishedAt: r.lastFinishedAt,
  });
  rows.sort((a, b) => compareResults(toResult(a), toResult(b)) || a.userId.localeCompare(b.userId));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && compareResults(toResult(prev), toResult(r)) === 0 ? prev.rank : i + 1;
  });
  return rows;
}

function groupByUser(results: AttemptResult[]) {
  const map = new Map<string, AttemptResult[]>();
  for (const r of results) {
    const list = map.get(r.userId);
    if (list) list.push(r);
    else map.set(r.userId, [r]);
  }
  return map;
}

/**
 * Liga: por usuario se suman sus mejores K resultados.
 * Quien llama ya filtró: solo cuestionarios computables (CLOSED, no EXPIRED) dentro de la ventana,
 * usuarios inscriptos y no baneados.
 */
export function computeLeagueStandings(results: AttemptResult[], bestK: number): StandingRow[] {
  const rows: StandingRow[] = [];
  for (const [userId, list] of groupByUser(results)) {
    const best = [...list].sort(compareResults).slice(0, bestK);
    rows.push(aggregate(userId, best));
  }
  return assignRanks(rows);
}

/** Torneo: suma de todos los cuestionarios (el puntaje ya incluye comodines). */
export function computeTournamentStandings(results: AttemptResult[]): StandingRow[] {
  const rows: StandingRow[] = [];
  for (const [userId, list] of groupByUser(results)) rows.push(aggregate(userId, list));
  return assignRanks(rows);
}
