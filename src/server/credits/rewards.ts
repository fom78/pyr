import { prisma, type Db } from "@/server/db";
import { getSettings } from "@/server/config/service";
import { postTransaction } from "./service";

export async function grantSignupBonus(userId: string, db: Db = prisma) {
  const s = await getSettings(db);
  if (s["credits.signupBonus"] <= 0) return null;
  return postTransaction(
    {
      userId,
      amount: s["credits.signupBonus"],
      type: "SIGNUP_BONUS",
      reason: "Bono de bienvenida",
      idempotencyKey: `signup:${userId}`,
    },
    db,
  );
}

export type RewardLine = { type: "QUIZ_REWARD" | "PERFORMANCE_BONUS" | "STREAK_BONUS"; amount: number; reason: string; key: string };

/** Qué créditos corresponden por un cuestionario de liga terminado (pura). */
export function computeLeagueRewards(
  p: { attemptId: string; quizTitle: string; correct: number; total: number; streak: number },
  s: {
    quizCompleted: number;
    goodPerformance: number;
    goodPerformanceRatio: number;
    perfectBonus: number;
    streakLength: number;
    streakBonus: number;
  },
): RewardLine[] {
  const out: RewardLine[] = [];
  if (s.quizCompleted > 0)
    out.push({ type: "QUIZ_REWARD", amount: s.quizCompleted, reason: `Completaste "${p.quizTitle}"`, key: `reward:${p.attemptId}` });
  const ratio = p.total ? p.correct / p.total : 0;
  if (p.total > 0 && p.correct === p.total && s.perfectBonus > 0)
    out.push({ type: "PERFORMANCE_BONUS", amount: s.perfectBonus, reason: `¡Cuestionario perfecto! (${p.quizTitle})`, key: `perfect:${p.attemptId}` });
  else if (ratio >= s.goodPerformanceRatio && s.goodPerformance > 0)
    out.push({
      type: "PERFORMANCE_BONUS",
      amount: s.goodPerformance,
      reason: `Buen desempeño: ${Math.round(ratio * 100)}% de aciertos (${p.quizTitle})`,
      key: `perf:${p.attemptId}`,
    });
  if (p.streak > 0 && p.streak % s.streakLength === 0 && s.streakBonus > 0)
    out.push({ type: "STREAK_BONUS", amount: s.streakBonus, reason: `Racha de ${p.streak} cuestionarios seguidos`, key: `streak:${p.attemptId}` });
  return out;
}

/** Actualiza la racha del usuario en la categoría y devuelve el valor nuevo. */
export async function updateStreak(userId: string, quiz: { id: string; categoryId: string; opensAt: Date }, db: Db = prisma) {
  const prev = await db.quiz.findFirst({
    where: { categoryId: quiz.categoryId, tournamentId: null, publishedAt: { not: null }, opensAt: { lt: quiz.opensAt } },
    orderBy: { opensAt: "desc" },
    select: { id: true },
  });
  const st = await db.streakState.findUnique({ where: { userId_categoryId: { userId, categoryId: quiz.categoryId } } });
  const current = st && prev && st.lastQuizId === prev.id ? st.current + 1 : 1;
  await db.streakState.upsert({
    where: { userId_categoryId: { userId, categoryId: quiz.categoryId } },
    create: { userId, categoryId: quiz.categoryId, current, best: current, lastQuizId: quiz.id },
    update: { current, best: Math.max(current, st?.best ?? 0), lastQuizId: quiz.id },
  });
  return current;
}

/** Otorga los créditos de un intento de liga terminado. Idempotente (keys por intento). */
export async function grantLeagueRewards(
  attempt: { id: string; userId: string; correctCount: number },
  quiz: { id: string; title: string; categoryId: string; opensAt: Date },
  total: number,
  db: Db = prisma,
) {
  const s = await getSettings(db);
  const streak = await updateStreak(attempt.userId, quiz, db);
  const lines = computeLeagueRewards(
    { attemptId: attempt.id, quizTitle: quiz.title, correct: attempt.correctCount, total, streak },
    {
      quizCompleted: s["credits.quizCompleted"],
      goodPerformance: s["credits.goodPerformance"],
      goodPerformanceRatio: s["credits.goodPerformanceRatio"],
      perfectBonus: s["credits.perfectBonus"],
      streakLength: s["credits.streakLength"],
      streakBonus: s["credits.streakBonus"],
    },
  );
  for (const l of lines)
    await postTransaction({ userId: attempt.userId, amount: l.amount, type: l.type, reason: l.reason, idempotencyKey: l.key }, db);
  return { lines, streak };
}
