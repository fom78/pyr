"use client";

import { useTransition } from "react";
import { Copy, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { QuizStatus } from "@/generated/prisma/enums";
import type { FormState } from "@/server/actions";
import { copyQuizAction, deleteQuizAction, publishQuizAction, recalculateQuizAction, unpublishQuizAction } from "../actions";

export function useActionToast() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FormState | void>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r && r.ok === false) toast.error(r.error);
      else toast.success(ok);
    });
  return { pending, run };
}

export function QuizActions({ id, status, canPublish, canRecalc }: { id: string; status: QuizStatus; canPublish: boolean; canRecalc: boolean }) {
  const { pending, run } = useActionToast();
  return (
    <>
      {status === "DRAFT" && canPublish && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={pending}>
              <Eye /> Publicar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Publicar el cuestionario?</AlertDialogTitle>
              <AlertDialogDescription>
                Se congela el puntaje y queda visible como “próximamente” hasta que abra. Mientras no abra, podés despublicarlo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => publishQuizAction(id), "Cuestionario publicado.")}>Publicar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {status === "SCHEDULED" && canPublish && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => unpublishQuizAction(id), "Volvió a borrador.")}>
          <EyeOff /> Despublicar
        </Button>
      )}
      <form action={copyQuizAction.bind(null, id)}>
        <Button variant="outline" type="submit">
          <Copy /> Copiar
        </Button>
      </form>
      {canRecalc && (status === "ACTIVE" || status === "CLOSED" || status === "EXPIRED") && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => recalculateQuizAction(id), "Puntajes y tablas recalculados.")}>
          <RefreshCw /> Recalcular
        </Button>
      )}
      {status === "DRAFT" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" aria-label="Eliminar borrador">
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este borrador?</AlertDialogTitle>
              <AlertDialogDescription>Las preguntas no se borran, solo el cuestionario.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form action={deleteQuizAction.bind(null, id)}>
                <AlertDialogAction type="submit">Eliminar</AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
