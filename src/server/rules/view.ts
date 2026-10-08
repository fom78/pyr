import type { Settings } from "@/server/config/registry";
import { scoreAnswer, type ScoringSnapshot } from "@/server/scoring/scoring";

/**
 * Datos de reglas derivados de la configuración real. Toda pantalla que explique reglas usa esto:
 * así, si el admin cambia K, días o pesos, los textos muestran los valores actuales.
 */
export function rulesFromSettings(s: Settings) {
  const scoring: ScoringSnapshot = { base: s["scoring.base"], timeBonus: s["scoring.timeBonus"], wrongPenalty: s["scoring.wrongPenalty"] };
  const limit = s["quiz.timeLimitSec"];
  const fast = Math.round(limit / 4);
  const slow = Math.round((limit * 3) / 4);
  return {
    lives: s["lives.max"],
    leaveCooldownDays: s["league.leaveCooldownDays"],
    rejoinBlockDays: Math.max(s["league.rejoinBlockDays"], s["league.leaveCooldownDays"]),
    bestK: s["ranking.bestK"],
    windowDays: s["ranking.windowDays"],
    frequencyDays: s["quiz.frequencyDays"],
    activeDays: s["quiz.activeDays"],
    computableDays: s["quiz.computableDays"],
    revealOnClose: s["review.revealAnswers"] === "ON_CLOSE",
    scoring,
    /** Ejemplo numérico de puntaje con los pesos actuales. */
    scoringExample: {
      limit,
      fast,
      slow,
      fastPoints: scoreAnswer({ isCorrect: true, timeMs: fast * 1000, limitMs: limit * 1000 }, scoring).points,
      slowPoints: scoreAnswer({ isCorrect: true, timeMs: slow * 1000, limitMs: limit * 1000 }, scoring).points,
      wrongPoints: scoreAnswer({ isCorrect: false, timeMs: 0, limitMs: limit * 1000 }, scoring).points,
    },
    credits: {
      signup: s["credits.signupBonus"],
      quiz: s["credits.quizCompleted"],
      good: s["credits.goodPerformance"],
      goodPct: Math.round(s["credits.goodPerformanceRatio"] * 100),
      perfect: s["credits.perfectBonus"],
      streakLength: s["credits.streakLength"],
      streakBonus: s["credits.streakBonus"],
    },
    wildcardsPerQuiz: s["tournament.wildcardsPerQuiz"],
  };
}

export type RulesView = ReturnType<typeof rulesFromSettings>;
