import { prisma } from "@/server/db";
import { getSettings } from "@/server/config/service";
import { getQuizStatus } from "@/server/quiz/status";
import { getStrategy } from "@/server/wildcards/strategies";
import { compareResults } from "@/server/scoring/scoring";
import { fileUrl } from "@/server/storage";
import { leagueImpact } from "@/server/ranking/service";

/**
 * Resultado de un intento para su dueño. Las respuestas correctas solo se incluyen si el
 * cuestionario ya cerró (o si la config permite mostrarlas al terminar).
 */
export async function getAttemptResult(attemptId: string, userId: string, now = new Date()) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      quiz: { include: { category: true, tournament: true } },
      wildcardUse: true,
      answers: {
        orderBy: { index: "asc" },
        include: { quizQuestion: { include: { question: { include: { options: { orderBy: { position: "asc" } } } } } } },
      },
    },
  });
  if (!attempt || attempt.userId !== userId) return null;
  const s = await getSettings();
  const status = getQuizStatus(attempt.quiz, now);
  const quizClosed = status === "CLOSED" || status === "EXPIRED";
  const reveal = attempt.status !== "IN_PROGRESS" && (quizClosed || s["review.revealAnswers"] === "ON_FINISH");

  // Posición dentro del cuestionario (entre los que ya terminaron)
  const others = await prisma.attempt.findMany({
    where: { quizId: attempt.quizId, status: { in: ["FINISHED", "TIMED_OUT"] } },
    select: { id: true, score: true, correctCount: true, totalTimeMs: true, finishedAt: true },
  });
  const sorted = others.sort(compareResults);
  const position = sorted.findIndex((o) => o.id === attempt.id) + 1;

  const wildcard = attempt.wildcardUse
    ? {
        name: getStrategy(attempt.wildcardUse.type).name,
        reveal: attempt.status !== "IN_PROGRESS" ? getStrategy(attempt.wildcardUse.type).reveal(attempt.wildcardUse.state as Record<string, unknown>) : null,
      }
    : null;

  // Liga: la tabla se actualiza al terminar, así que se puede mostrar el impacto real
  const league =
    attempt.quiz.categoryId && !attempt.quiz.tournamentId && attempt.status !== "IN_PROGRESS"
      ? await leagueImpact(attempt, attempt.quiz.categoryId, now)
      : null;

  return {
    attempt,
    quiz: attempt.quiz,
    league,
    status,
    reveal,
    position,
    participants: sorted.length,
    wildcard,
    answers: attempt.answers.map((a) => {
      const q = a.quizQuestion.question;
      const selected = q.options.find((o) => o.id === a.selectedOptionId) ?? null;
      const correct = q.options.find((o) => o.isCorrect) ?? null;
      return {
        index: a.index,
        text: q.text,
        imageUrl: fileUrl(q.imageKey),
        voided: a.quizQuestion.voided,
        answered: Boolean(a.answeredAt && a.selectedOptionId),
        selectedText: selected?.text ?? null,
        timeMs: a.timeMs,
        points: a.points,
        // Solo si se puede revelar
        isCorrect: reveal ? a.isCorrect : null,
        correctText: reveal ? (correct?.text ?? null) : null,
        explanation: reveal ? q.explanation : null,
      };
    }),
  };
}
