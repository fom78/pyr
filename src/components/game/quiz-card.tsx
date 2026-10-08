import Link from "next/link";
import { CheckCircle2, Clock, Lock, Play, Timer } from "lucide-react";
import type { QuizStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { QuizStatusBadge } from "@/components/game/quiz-status-badge";
import { formatDateTime, fromNow } from "@/lib/format";
import { cn } from "@/lib/utils";

export type QuizCardData = {
  id: string;
  title: string;
  derived: QuizStatus;
  opensAt: Date;
  closesAt: Date;
  expiresAt: Date;
  questionCount: number;
  timeMode: string;
  timeLimitSec: number;
  attempt: { id: string; status: string; score: number; correctCount: number } | null;
  subtitle?: React.ReactNode;
};

export function QuizCard({ q, canPlay, tz }: { q: QuizCardData; canPlay: boolean; tz: string }) {
  const playable = q.derived === "ACTIVE" && !q.attempt;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3", playable && canPlay && "border-primary/50 bg-primary/5")}>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{q.title}</span>
          <QuizStatusBadge status={q.derived} />
        </div>
        {q.subtitle}
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" />
            {q.questionCount} preguntas · {q.timeMode === "PER_QUESTION" ? `${q.timeLimitSec} s c/u` : `${Math.round(q.timeLimitSec / 60)} min en total`}
          </span>
          {q.derived === "SCHEDULED" && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> abre {fromNow(q.opensAt)} ({formatDateTime(q.opensAt, tz)})
            </span>
          )}
          {q.derived === "ACTIVE" && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> cierra {fromNow(q.closesAt)}
            </span>
          )}
          {q.derived === "CLOSED" && <span>computable hasta {formatDateTime(q.expiresAt, tz)}</span>}
        </p>
      </div>
      {q.attempt ? (
        <Button asChild variant="outline" size="sm">
          <Link href={q.attempt.status === "IN_PROGRESS" ? `/jugar/${q.attempt.id}` : `/resultados/${q.attempt.id}`}>
            {q.attempt.status === "IN_PROGRESS" ? (
              <>
                <Play /> Continuar
              </>
            ) : (
              <>
                <CheckCircle2 className="text-success" /> {q.attempt.score} pts
              </>
            )}
          </Link>
        </Button>
      ) : playable ? (
        canPlay ? (
          <Button asChild size="sm">
            <Link href={`/cuestionarios/${q.id}`}>
              <Play /> Jugar
            </Link>
          </Button>
        ) : (
          <Lock className="size-4 text-muted-foreground" aria-label="No disponible" />
        )
      ) : null}
    </div>
  );
}
