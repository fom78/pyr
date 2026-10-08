import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Clock, ListChecks, RotateCcw, Trophy } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { checkCanPlay, remainingWildcards } from "@/server/game/engine";
import { getQuizStatus } from "@/server/quiz/status";
import { readScoring } from "@/server/scoring/attempt";
import { wildcardStrategies } from "@/server/wildcards/strategies";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuizStatusBadge } from "@/components/game/quiz-status-badge";
import { fromNow } from "@/lib/format";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Antes de empezar" };

export default async function PreQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { category: true, tournament: true, _count: { select: { questions: { where: { voided: false } } } } },
  });
  if (!quiz || !quiz.publishedAt) notFound();
  const check = await checkCanPlay(user.id, quiz.id);
  if (!check.ok && "attemptId" in check && check.attemptId)
    redirect(check.attemptStatus === "IN_PROGRESS" ? `/jugar/${check.attemptId}` : `/resultados/${check.attemptId}`);

  const status = getQuizStatus(quiz);
  const n = quiz._count.questions;
  const scoring = readScoring(quiz.scoring, { base: 100, timeBonus: 50, wrongPenalty: 0 });
  const wildcards =
    quiz.tournament && quiz.tournament.wildcardsPerQuiz > 0
      ? (await remainingWildcards(quiz.tournament.id, user.id)).map((w) => ({
          ...w,
          name: wildcardStrategies[w.type].name,
          description: wildcardStrategies[w.type].description,
          example: wildcardStrategies[w.type].example(scoring),
        }))
      : [];
  const back = quiz.tournament
    ? { href: `/torneos/${quiz.tournament.slug}`, label: quiz.tournament.name }
    : { href: `/categorias/${quiz.category!.slug}`, label: quiz.category!.name };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        back={back}
        title={quiz.title}
        description={
          <span className="flex items-center gap-2">
            <QuizStatusBadge status={status} /> {status === "ACTIVE" && <>cierra {fromNow(quiz.closesAt)}</>}
          </span>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Antes de empezar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-3 text-sm">
            <li className="flex gap-3">
              <ListChecks className="size-5 shrink-0 text-primary" />
              <span>
                <strong>{n} preguntas</strong> de opción múltiple. Una sola es correcta.
              </span>
            </li>
            <li className="flex gap-3">
              <Clock className="size-5 shrink-0 text-primary" />
              <span>
                {quiz.timeMode === "PER_QUESTION" ? (
                  <>
                    <strong>{quiz.timeLimitSec} segundos por pregunta</strong> (unos {Math.ceil((n * quiz.timeLimitSec) / 60)} minutos en total).
                  </>
                ) : (
                  <>
                    <strong>{Math.round(quiz.timeLimitSec / 60)} minutos en total</strong> para todo el cuestionario.
                  </>
                )}{" "}
                Cada acierto vale {scoring.base} puntos + hasta {scoring.timeBonus} por velocidad.
                {scoring.wrongPenalty > 0 && ` Los errores restan ${scoring.wrongPenalty}.`}
              </span>
            </li>
            <li className="flex gap-3">
              <AlertTriangle className="size-5 shrink-0 text-warning" />
              <span>
                <strong>Tenés un solo intento.</strong> El reloj <strong>no se detiene</strong> aunque cierres la app o se corte la conexión: las
                preguntas que no respondas a tiempo cuentan como incorrectas.
              </span>
            </li>
            <li className="flex gap-3">
              <RotateCcw className="size-5 shrink-0 text-muted-foreground" />
              <span>No se puede volver atrás ni reiniciar. Buscá un momento tranquilo.</span>
            </li>
            {quiz.tournament && (
              <li className="flex gap-3">
                <Trophy className="size-5 shrink-0 text-warning" />
                <span>Este cuestionario suma para el torneo {quiz.tournament.name}.</span>
              </li>
            )}
          </ul>

          {check.ok ? (
            <StartForm quizId={quiz.id} wildcards={wildcards} maxWildcards={quiz.tournament?.wildcardsPerQuiz ?? 0} />
          ) : (
            <div className="grid gap-3">
              <p className="rounded-md bg-muted p-3 text-sm">{check.reason}</p>
              <Button asChild variant="outline">
                <Link href={back.href}>Volver</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
