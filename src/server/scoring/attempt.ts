import type { WildcardState, WildcardStrategy } from "@/server/wildcards/strategies";
import { scoreAnswer, totalize, type ScoringSnapshot } from "./scoring";

export type AnswerFacts = {
  index: number;
  isCorrect: boolean;
  timeMs: number;
  voided: boolean;
};

export type ScoredAnswer = AnswerFacts & { basePoints: number; bonusPoints: number; points: number };

/**
 * Calcula el puntaje completo de un intento (pura). Se usa al terminar y al recalcular.
 * `limitMs` es el tiempo de referencia por pregunta para el bonus.
 */
export function scoreAttempt(
  answers: AnswerFacts[],
  limitMs: number,
  scoring: ScoringSnapshot,
  wildcard?: { strategy: WildcardStrategy; state: WildcardState },
) {
  const scored: ScoredAnswer[] = answers.map((a) => ({
    ...a,
    ...scoreAnswer({ ...a, limitMs }, scoring, wildcard?.strategy.multipliers(a.index, wildcard.state)),
  }));
  const totals = totalize(scored);
  const score = wildcard ? wildcard.strategy.finalize(totals.score, wildcard.state) : totals.score;
  return { answers: scored, score, correctCount: totals.correctCount, totalTimeMs: totals.totalTimeMs };
}

/** Lee el snapshot de puntaje guardado en el cuestionario, con defaults defensivos. */
export function readScoring(raw: unknown, fallback: ScoringSnapshot): ScoringSnapshot {
  const r = (raw ?? {}) as Partial<ScoringSnapshot>;
  return {
    base: Number.isFinite(r.base) ? Number(r.base) : fallback.base,
    timeBonus: Number.isFinite(r.timeBonus) ? Number(r.timeBonus) : fallback.timeBonus,
    wrongPenalty: Number.isFinite(r.wrongPenalty) ? Number(r.wrongPenalty) : fallback.wrongPenalty,
  };
}
