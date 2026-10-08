import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, CircleSlash, Clock, Lock, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getAttemptResult } from "@/server/game/results";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMs, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Resultado" };

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;
  const r = await getAttemptResult(attemptId, user.id);
  if (!r) notFound();
  if (r.attempt.status === "IN_PROGRESS") redirect(`/jugar/${attemptId}`);
  const { attempt, quiz } = r;
  const total = r.answers.filter((a) => !a.voided).length;
  const back = quiz.tournament
    ? { href: `/torneos/${quiz.tournament.slug}`, label: quiz.tournament.name }
    : { href: `/categorias/${quiz.category!.slug}`, label: quiz.category!.name };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={back} title={quiz.title} description={attempt.status === "TIMED_OUT" ? "Se terminó el tiempo." : "¡Terminaste!"} />
      <div className="mb-6 grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-black text-primary tabular-nums">{formatNumber(attempt.score)}</p>
            <p className="text-xs text-muted-foreground">puntos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-black tabular-nums">
              {attempt.correctCount}
              <span className="text-lg text-muted-foreground">/{total}</span>
            </p>
            <p className="text-xs text-muted-foreground">aciertos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-black tabular-nums">{formatMs(attempt.totalTimeMs)}</p>
            <p className="text-xs text-muted-foreground">tiempo</p>
          </CardContent>
        </Card>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">
        Vas {r.position}° de {r.participants} en este cuestionario
        {r.status === "ACTIVE" && " (puede cambiar mientras siga abierto)"}.
      </p>
      {r.wildcard && (
        <p className="mb-4 rounded-md bg-warning/15 p-3 text-sm">
          🃏 Usaste <strong>{r.wildcard.name}</strong>. {r.wildcard.reveal}
        </p>
      )}
      {!r.reveal && (
        <p className="mb-4 flex gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Lock className="size-4 shrink-0" />
          Las respuestas correctas se muestran cuando cierre el cuestionario ({formatDateTime(quiz.closesAt, user.timezone)}), para que nadie las pueda
          pasar.
        </p>
      )}

      <h2 className="mb-2 font-semibold">Revisión</h2>
      <ol className="grid gap-2">
        {r.answers.map((a) => (
          <li key={a.index} className={cn("rounded-lg border p-3 text-sm", a.voided && "opacity-60")}>
            <div className="flex items-start gap-2">
              {a.voided ? (
                <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Anulada" />
              ) : a.isCorrect === null ? (
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Pendiente" />
              ) : a.isCorrect ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correcta" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Incorrecta" />
              )}
              <div className="grid flex-1 gap-1">
                <p className="font-medium">
                  {a.index + 1}. {a.text ?? "(pregunta con imagen)"} {a.voided && <span className="font-normal">(anulada)</span>}
                </p>
                <p>
                  Tu respuesta: {a.answered ? <strong>{a.selectedText}</strong> : <em className="text-muted-foreground">sin responder</em>}
                  {a.answered && <span className="text-muted-foreground"> · {formatMs(a.timeMs)}</span>}
                </p>
                {a.correctText && !a.isCorrect && (
                  <p>
                    Correcta: <strong className="text-success">{a.correctText}</strong>
                  </p>
                )}
                {a.explanation && <p className="text-muted-foreground">{a.explanation}</p>}
              </div>
              {r.reveal && <span className="shrink-0 font-semibold tabular-nums">{a.points > 0 ? `+${a.points}` : a.points}</span>}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link href={back.href}>Volver a {back.label}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Inicio</Link>
        </Button>
      </div>
    </div>
  );
}
