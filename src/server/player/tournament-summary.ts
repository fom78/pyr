/** Resumen de torneos jugados para el perfil (puro). */
export type TournamentResultRow = { rank: number; participants: number; prizeCredits: number; points: number };

export type TournamentSummary = {
  played: number;
  podiums: { first: number; second: number; third: number };
  bestRank: number | null;
  /** Veces que terminó en el 10 % de arriba de la tabla. */
  topTen: number;
  prizeCredits: number;
  /** Percentil promedio (100 = siempre primero). null sin torneos. */
  avgPercentile: number | null;
};

/** Percentil de un puesto: 100 para el primero, 0 para el último (un torneo de 1 participante cuenta como 100). */
export function percentile(rank: number, participants: number) {
  if (participants <= 1) return 100;
  return Math.round((100 * (participants - rank)) / (participants - 1));
}

export function summarizeResults(rows: TournamentResultRow[]): TournamentSummary {
  const podiums = { first: 0, second: 0, third: 0 };
  let topTen = 0;
  let prizeCredits = 0;
  for (const r of rows) {
    if (r.rank === 1) podiums.first++;
    else if (r.rank === 2) podiums.second++;
    else if (r.rank === 3) podiums.third++;
    if (r.rank <= Math.max(1, Math.ceil(r.participants * 0.1))) topTen++;
    prizeCredits += r.prizeCredits;
  }
  return {
    played: rows.length,
    podiums,
    bestRank: rows.length ? Math.min(...rows.map((r) => r.rank)) : null,
    topTen,
    prizeCredits,
    avgPercentile: rows.length ? Math.round(rows.reduce((a, r) => a + percentile(r.rank, r.participants), 0) / rows.length) : null,
  };
}
