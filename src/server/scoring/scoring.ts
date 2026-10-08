/**
 * Puntaje — funciones puras.
 * Por acierto: base × mBase + round(timeBonus × max(0, 1 − t/limit)) × mBonus
 * Incorrecta / sin responder: −wrongPenalty (si está activada).
 * Pregunta anulada: 0 y su tiempo no cuenta.
 */

export type ScoringSnapshot = { base: number; timeBonus: number; wrongPenalty: number };

export type Multipliers = { base: number; bonus: number };
export const NO_MULTIPLIER: Multipliers = { base: 1, bonus: 1 };

export type AnswerInput = {
  isCorrect: boolean;
  timeMs: number;
  limitMs: number;
  voided?: boolean;
};

export type AnswerScore = { basePoints: number; bonusPoints: number; points: number };

export function scoreAnswer(a: AnswerInput, s: ScoringSnapshot, m: Multipliers = NO_MULTIPLIER): AnswerScore {
  if (a.voided) return { basePoints: 0, bonusPoints: 0, points: 0 };
  if (!a.isCorrect) {
    const p = s.wrongPenalty ? -Math.abs(s.wrongPenalty) : 0;
    return { basePoints: p, bonusPoints: 0, points: p };
  }
  const ratio = a.limitMs > 0 ? Math.max(0, 1 - a.timeMs / a.limitMs) : 0;
  const basePoints = Math.round(s.base * m.base);
  const bonusPoints = Math.round(s.timeBonus * ratio * m.bonus);
  return { basePoints, bonusPoints, points: basePoints + bonusPoints };
}

export type AttemptTotals = { score: number; correctCount: number; totalTimeMs: number };

export function totalize(answers: (AnswerScore & { isCorrect: boolean; timeMs: number; voided?: boolean })[]): AttemptTotals {
  let score = 0;
  let correctCount = 0;
  let totalTimeMs = 0;
  for (const a of answers) {
    if (a.voided) continue;
    score += a.points;
    if (a.isCorrect) correctCount++;
    totalTimeMs += a.timeMs;
  }
  return { score, correctCount, totalTimeMs };
}

export type RankableResult = { score: number; correctCount: number; totalTimeMs: number; finishedAt: Date | null };

/** Desempate: más puntos → más aciertos → menos tiempo → terminó antes. */
export function compareResults(a: RankableResult, b: RankableResult): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
  if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
  const fa = a.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const fb = b.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return fa - fb;
}
