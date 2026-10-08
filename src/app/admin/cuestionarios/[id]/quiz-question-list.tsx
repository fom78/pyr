"use client";

import { Ban, CheckCircle2, Circle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/forms/native-select";
import { cn } from "@/lib/utils";
import { changeCorrectAction, shuffleOverrideAction, voidQuestionAction } from "../actions";
import { useActionToast } from "@/components/use-action-toast";

type Item = {
  id: string;
  questionId: string;
  text: string | null;
  voided: boolean;
  shuffleOptions: boolean | null;
  options: { id: string; text: string | null; isCorrect: boolean }[];
};

export function QuizQuestionList({ quizId, items, canRecalc }: { quizId: string; items: Item[]; canRecalc: boolean }) {
  const { pending, run } = useActionToast();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preguntas ({items.length})</CardTitle>
        <CardDescription>
          El cuestionario ya está publicado: las preguntas no se pueden cambiar. Si hay un error podés anular una pregunta o corregir la
          respuesta correcta; los puntajes y tablas se recalculan (queda registrado en auditoría).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {items.map((it, i) => (
            <li key={it.id} className={cn("rounded-md border p-3 text-sm", it.voided && "opacity-60")}>
              <p className="font-medium">
                {i + 1}. {it.text ?? <em>(imagen)</em>} {it.voided && <span className="text-destructive">(anulada)</span>}
              </p>
              <ul className="mt-2 grid gap-1">
                {it.options.map((o) => (
                  <li key={o.id} className="flex items-center gap-2">
                    {canRecalc && !o.isCorrect ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="text-muted-foreground hover:text-success"
                        aria-label={`Marcar "${o.text}" como correcta y recalcular`}
                        title="Marcar como correcta y recalcular"
                        onClick={() => {
                          if (confirm(`¿Marcar "${o.text}" como la respuesta correcta? Se recalculan todos los cuestionarios que usan esta pregunta.`))
                            run(() => changeCorrectAction(quizId, it.questionId, o.id), "Respuesta corregida y puntajes recalculados.");
                        }}
                      >
                        <Circle className="size-4" />
                      </button>
                    ) : o.isCorrect ? (
                      <CheckCircle2 className="size-4 text-success" aria-label="Correcta" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    <span className={cn(o.isCorrect && "font-medium")}>{o.text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <NativeSelect
                  className="h-8 w-auto text-xs"
                  aria-label="Orden de opciones de esta pregunta"
                  defaultValue={it.shuffleOptions === null ? "" : String(it.shuffleOptions)}
                  onChange={(e) =>
                    run(
                      () => shuffleOverrideAction(quizId, it.id, e.target.value === "" ? null : e.target.value === "true"),
                      "Preferencia guardada.",
                    )
                  }
                >
                  <option value="">Opciones: según cuestionario</option>
                  <option value="true">Opciones: mezclar</option>
                  <option value="false">Opciones: orden fijo</option>
                </NativeSelect>
                {canRecalc && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(it.voided ? "¿Restaurar esta pregunta?" : "¿Anular esta pregunta? No sumará ni restará para nadie."))
                        run(() => voidQuestionAction(quizId, it.id, !it.voided), it.voided ? "Pregunta restaurada." : "Pregunta anulada.");
                    }}
                  >
                    {it.voided ? <RotateCcw /> : <Ban />} {it.voided ? "Restaurar" : "Anular"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
