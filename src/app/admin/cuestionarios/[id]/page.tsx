import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, userCan } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getQuizStatus } from "@/server/quiz/status";
import { readScoring } from "@/server/scoring/attempt";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMs, toDateTimeInput } from "@/lib/format";
import { compareResults } from "@/server/scoring/scoring";
import { QuizForm } from "../quiz-form";
import { quizRefOptions } from "../refs";
import { QuizStatusBadge } from "@/components/game/quiz-status-badge";
import { QuizActions } from "./quiz-actions";
import { QuestionPicker } from "./question-picker";
import { QuizQuestionList } from "./quiz-question-list";

export const metadata = { title: "Cuestionario" };

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("quiz.manage");
  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      category: true,
      tournament: true,
      questions: {
        orderBy: { position: "asc" },
        include: { question: { include: { options: { orderBy: { position: "asc" } }, categories: { include: { category: true } } } } },
      },
      attempts: { include: { user: { select: { name: true, username: true } } } },
    },
  });
  if (!quiz) notFound();
  const now = new Date();
  const status = getQuizStatus(quiz, now);
  const [canPublish, canRecalc] = await Promise.all([userCan(user, "quiz.publish"), userCan(user, "quiz.recalculate")]);
  const tz = user.timezone;
  const scoring = readScoring(quiz.scoring, { base: 100, timeBonus: 50, wrongPenalty: 0 });
  const attempts = [...quiz.attempts].sort((a, b) => compareResults(a, b));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {quiz.title} <QuizStatusBadge status={status} />
          </span>
        }
        description={
          <>
            {quiz.tournament ? (
              <Link className="underline" href={`/admin/torneos/${quiz.tournament.id}`}>
                🏆 {quiz.tournament.name}
              </Link>
            ) : (
              <>
                {quiz.category?.icon} {quiz.category?.name}
              </>
            )}{" "}
            · {quiz.questions.length} preguntas · {quiz.attempts.length} intentos
            {quiz.copiedFromId && (
              <>
                {" "}
                · copiado de{" "}
                <Link className="underline" href={`/admin/cuestionarios/${quiz.copiedFromId}`}>
                  otro cuestionario
                </Link>
              </>
            )}
          </>
        }
        back={{ href: "/admin/cuestionarios", label: "Cuestionarios" }}
        actions={<QuizActions id={quiz.id} status={status} canPublish={canPublish} canRecalc={canRecalc} />}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <QuizForm
          id={quiz.id}
          mode={status === "DRAFT" ? "full" : status === "SCHEDULED" ? "scheduled" : "opened"}
          timezone={tz}
          refs={await quizRefOptions()}
          initial={{
            title: quiz.title,
            description: quiz.description ?? "",
            ref: quiz.tournamentId ? `t:${quiz.tournamentId}` : `c:${quiz.categoryId}`,
            opensAt: toDateTimeInput(quiz.opensAt, tz),
            closesAt: toDateTimeInput(quiz.closesAt, tz),
            expiresAt: toDateTimeInput(quiz.expiresAt, tz),
            timeMode: quiz.timeMode,
            timeLimitSec: quiz.timeLimitSec,
            shuffleQuestions: quiz.shuffleQuestions,
            shuffleOptions: quiz.shuffleOptions,
            ...scoring,
          }}
        />
        <div className="grid content-start gap-6">
          {status === "DRAFT" ? (
            <QuestionPicker
              quizId={quiz.id}
              categoryFilterId={quiz.categoryId ?? undefined}
              selected={quiz.questions.map((qq) => ({
                id: qq.questionId,
                text: qq.question.text,
                status: qq.question.status,
                difficulty: qq.question.difficulty,
              }))}
            />
          ) : (
            <QuizQuestionList
              quizId={quiz.id}
              canRecalc={canRecalc}
              items={quiz.questions.map((qq) => ({
                id: qq.id,
                questionId: qq.questionId,
                text: qq.question.text,
                voided: qq.voided,
                shuffleOptions: qq.shuffleOptions,
                options: qq.question.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
              }))}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultados ({attempts.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {attempts.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Nadie jugó todavía.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Jugador</TableHead>
                      <TableHead className="text-right">Puntos</TableHead>
                      <TableHead className="text-right">Aciertos</TableHead>
                      <TableHead className="text-right">Tiempo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attempts.map((a, i) => (
                      <TableRow key={a.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>{a.user.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.score}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.correctCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMs(a.totalTimeMs)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.status === "IN_PROGRESS" ? "jugando" : a.status === "TIMED_OUT" ? "tiempo agotado" : "terminado"}
                          {a.finishedAt && ` · ${formatDateTime(a.finishedAt, tz)}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
