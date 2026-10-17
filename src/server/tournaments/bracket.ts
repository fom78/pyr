/** Cuadro de una eliminatoria (funciones puras). Rondas desde 1; en cada ronda, partidos desde 0. */
import type { MatchResult } from "@/generated/prisma/client";

/** Tamaños de cuadro permitidos (tope de inscriptos de una eliminatoria). */
export const BRACKET_SIZES = [4, 8, 16, 32, 64, 128, 256] as const;

export function isBracketSize(n: number) {
  return (BRACKET_SIZES as readonly number[]).includes(n);
}

/** Menor potencia de 2 que cubre a `n` jugadores (mínimo 2), sin pasar del tope. 62 → 64, 31 → 32. */
export function bracketSize(n: number, max: number) {
  let size = 2;
  while (size < n) size *= 2;
  return Math.min(size, max);
}

export function roundsFor(size: number) {
  return Math.round(Math.log2(size));
}

/**
 * Orden estándar de cabezas de serie en el cuadro: 8 → [1, 8, 4, 5, 2, 7, 3, 6]. El partido p
 * enfrenta a los lugares 2p y 2p+1, así el 1 y el 2 solo pueden cruzarse en la final.
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    order = order.flatMap((s) => [s, n - s]);
  }
  return order;
}

/** Cruces de la primera ronda: [siembra A, siembra B | null]. Los que no existen (> n) son pases libres de los mejores sembrados. */
export function firstRoundPairs(n: number, size: number): [number, number | null][] {
  const order = seedOrder(size);
  const pairs: [number, number | null][] = [];
  for (let p = 0; p < size / 2; p++) {
    const [a, b] = [order[2 * p], order[2 * p + 1]];
    pairs.push(a <= n ? [a, b <= n ? b : null] : [b, null]);
  }
  return pairs;
}

/** Adónde va el ganador de un partido. */
export function nextSlot(round: number, position: number) {
  return { round: round + 1, position: Math.floor(position / 2), side: position % 2 === 0 ? ("A" as const) : ("B" as const) };
}

export type SideResult = { score: number; correctCount: number; totalTimeMs: number } | null;
export type MatchSide = { userId: string; seed: number; result: SideResult };

/**
 * Quién gana un partido: más puntos; si empatan, más aciertos, después menos tiempo y por último el
 * mejor sembrado. El que no jugó pierde por W.O.; si no jugó ninguno pasa el mejor sembrado.
 */
export function decideMatch(a: MatchSide, b: MatchSide): { winnerId: string; loserId: string; result: MatchResult } {
  const bySeed = a.seed <= b.seed ? [a, b] : [b, a];
  const out = (w: MatchSide, l: MatchSide, result: MatchResult) => ({ winnerId: w.userId, loserId: l.userId, result });
  if (!a.result && !b.result) return out(bySeed[0], bySeed[1], "WALKOVER");
  if (!a.result) return out(b, a, "WALKOVER");
  if (!b.result) return out(a, b, "WALKOVER");
  const diff = b.result.score - a.result.score || b.result.correctCount - a.result.correctCount || a.result.totalTimeMs - b.result.totalTimeMs;
  if (diff === 0) return out(bySeed[0], bySeed[1], "TIEBREAK");
  return diff < 0 ? out(a, b, "PLAYED") : out(b, a, "PLAYED");
}

/** "Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda de 32"… */
export function roundName(round: number, totalRounds: number, position = 0) {
  if (round === totalRounds && position === 1) return "Tercer puesto";
  const players = 2 ** (totalRounds - round + 1);
  if (players === 2) return "Final";
  if (players === 4) return "Semifinal";
  if (players === 8) return "Cuartos de final";
  if (players === 16) return "Octavos de final";
  return `Ronda de ${players}`;
}

export type BracketMatch = {
  round: number;
  position: number;
  playerAId: string | null;
  playerBId: string | null;
  winnerId: string | null;
  result: MatchResult | null;
};

/**
 * Puestos finales: campeón 1, finalista 2; semifinalistas 3 (o 3 y 4 con partido por el tercer
 * puesto), los de cuartos 5, los de octavos 9… (los que caen en la misma ronda empatan).
 */
export function finalRanks(matches: BracketMatch[], totalRounds: number, thirdPlace: boolean): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const m of matches) {
    if (!m.winnerId || m.result === "BYE") continue;
    const loser = m.winnerId === m.playerAId ? m.playerBId : m.playerAId;
    if (m.round === totalRounds) {
      const [w, l] = m.position === 0 ? [1, 2] : [3, 4];
      ranks.set(m.winnerId, w);
      if (loser) ranks.set(loser, l);
    } else if (loser && !(thirdPlace && m.round === totalRounds - 1)) {
      ranks.set(loser, 2 ** (totalRounds - m.round) + 1);
    }
  }
  return ranks;
}

export type SeedCandidate = {
  userId: string;
  /** Puesto en el torneo del que clasificó (null = inscripción abierta). */
  qualifiedRank: number | null;
  /** Percentil de ese puesto en su torneo (ganar uno de 200 pesa más que uno de 10). */
  sourcePercentile: number | null;
  /** Percentil promedio histórico en torneos (null = nunca jugó uno). */
  avgPercentile: number | null;
};

/**
 * Orden de siembra. Por clasificación: primero los clasificados por puesto (todos los 1º, después
 * los 2º…), entre iguales por percentil en su torneo; después el resto por su promedio en torneos;
 * lo que queda empatado, por sorteo. En modo RANDOM, todo por sorteo.
 */
export function seedPlayers(players: SeedCandidate[], mode: "QUALIFICATION" | "RANDOM", rng: () => number = Math.random): string[] {
  const keyed = players.map((p) => ({ p, r: rng() }));
  if (mode === "RANDOM") return keyed.sort((a, b) => a.r - b.r).map((x) => x.p.userId);
  const big = Number.MAX_SAFE_INTEGER;
  return keyed
    .sort(
      (a, b) =>
        (a.p.qualifiedRank ?? big) - (b.p.qualifiedRank ?? big) ||
        (b.p.sourcePercentile ?? -1) - (a.p.sourcePercentile ?? -1) ||
        (b.p.avgPercentile ?? -1) - (a.p.avgPercentile ?? -1) ||
        a.r - b.r,
    )
    .map((x) => x.p.userId);
}

/**
 * Preguntas de cada partido: `exclusive` propias y `shared` sorteadas de un pozo común de la ronda
 * (de `poolSize` preguntas). Así dos partidos de la misma ronda comparten pocas preguntas y en distinto
 * orden, y el cuadro gasta mucho menos banco. `unique` null = todas exclusivas.
 */
export function matchQuestionSplit(total: number, unique: number | null) {
  const exclusive = unique == null ? total : Math.min(Math.max(unique, 0), total);
  return { exclusive, shared: total - exclusive, poolSize: exclusive === total ? 0 : total };
}

/** Preguntas que puede necesitar el cuadro completo (con todos los partidos jugados). */
export function bracketQuestionNeed(size: number, total: number, unique: number | null, thirdPlace: boolean) {
  const { exclusive, poolSize } = matchQuestionSplit(total, unique);
  const matches = size - 1 + (thirdPlace && size >= 4 ? 1 : 0);
  return matches * exclusive + roundsFor(size) * poolSize;
}

/** `n` elementos al azar (sin repetir). */
export function sample<T>(list: T[], n: number, rng: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, n));
}
