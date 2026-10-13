import { prisma, type Db } from "@/server/db";
import { getSettings } from "@/server/config/service";
import { notifyUsers } from "@/server/notifications/service";

const BATCH = 50;

/**
 * Cuando cierra un cuestionario, avisa a cada jugador que lo terminó que ya puede ver la corrección
 * (solo con `review.revealAnswers = ON_CLOSE`; con ON_FINISH ya la vio al terminar). Idempotente:
 * marca `reviewNotifiedAt` y las notificaciones se deduplican por cuestionario.
 */
export async function notifyReviewReady(now = new Date(), db: Db = prisma) {
  const due = await db.quiz.findMany({
    where: { publishedAt: { not: null }, closesAt: { lte: now }, reviewNotifiedAt: null },
    select: { id: true, title: true },
    orderBy: { closesAt: "asc" },
    take: BATCH,
  });
  if (!due.length) return { quizzes: 0, sent: 0 };
  const onClose = (await getSettings(db))["review.revealAnswers"] === "ON_CLOSE";
  let sent = 0;
  for (const quiz of due) {
    if (onClose) {
      const attempts = await db.attempt.findMany({
        where: { quizId: quiz.id, status: { in: ["FINISHED", "TIMED_OUT"] } },
        select: { id: true, userId: true },
      });
      for (const a of attempts) {
        sent += await notifyUsers(
          [a.userId],
          {
            level: "INFO",
            kind: "quiz.reviewReady",
            title: `Ya podés ver la corrección de “${quiz.title}”`,
            body: "El cuestionario cerró: mirá qué respondiste bien y cuáles eran las correctas.",
            href: `/resultados/${a.id}`,
            dedupeKey: `quiz.reviewReady:${quiz.id}`,
          },
          db,
        );
      }
    }
    await db.quiz.update({ where: { id: quiz.id }, data: { reviewNotifiedAt: now } });
  }
  return { quizzes: due.length, sent };
}
