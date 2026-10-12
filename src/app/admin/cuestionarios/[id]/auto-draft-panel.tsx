"use client";

import { ListPlus, RefreshCw, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionToast } from "@/components/use-action-toast";
import { ConfirmButton } from "@/components/confirm-button";
import { fillDraftAction, regenerateDraftAction, replaceQuestionAction } from "../actions";

type Item = { id: string; text: string | null; difficulty: number; reused: boolean; lastUsed: string | null };

/** Revisión rápida de un borrador generado por el calendario automático. */
export function AutoDraftPanel({ quizId, items, expected }: { quizId: string; items: Item[]; expected: number }) {
  const { pending, run } = useActionToast();
  const missing = expected - items.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          Borrador automático
          <span className="flex flex-wrap gap-2">
            {missing > 0 && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => fillDraftAction(quizId), "Borrador completado.")}
              >
                <ListPlus /> Completar
              </Button>
            )}
            {items.length > 0 && (
              <ConfirmButton
                size="sm"
                variant="outline"
                disabled={pending}
                title="¿Regenerar las preguntas?"
                description={`Se vuelven a elegir las ${expected} preguntas del borrador. Las ${items.length} actuales vuelven al banco y pueden tocarle a otro turno.`}
                confirmLabel="Regenerar"
                onConfirm={() => run(() => regenerateDraftAction(quizId), "Preguntas regeneradas.")}
              >
                <RefreshCw /> Regenerar
              </ConfirmButton>
            )}
          </span>
        </CardTitle>
        <CardDescription>
          Generado por el calendario de la categoría. Revisá las preguntas, cambiá las que no te convenzan y aprobalo con
          “Publicar”.
          {missing > 0 && (
            <span className="mt-1 block">
              <strong className="text-destructive">
                Faltan {missing} pregunta{missing === 1 ? "" : "s"}: no había suficientes aprobadas en la categoría.
              </strong>{" "}
              Se completa solo cuando haya (el sistema revisa cada 15 minutos), o tocá “Completar” para hacerlo ahora.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="grid gap-1">
                <span>
                  {i + 1}. {it.text ?? <em>(imagen)</em>}
                </span>
                <span className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
                  Dificultad {it.difficulty}
                  {it.reused && (
                    <Badge variant="outline" className="text-[10px]">
                      Reutilizada{it.lastUsed ? ` · último uso ${it.lastUsed}` : ""}
                    </Badge>
                  )}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                title="Cambiar por otra (prioriza nunca usadas de la misma dificultad)"
                onClick={() => run(() => replaceQuestionAction(quizId, it.id), "Pregunta cambiada.")}
              >
                <Shuffle /> Cambiar
              </Button>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
