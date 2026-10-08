"use client";

import { useState } from "react";
import { Ban, Eye, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { useActionToast } from "@/components/use-action-toast";
import { cancelTournamentAction, generateQuizzesAction, publishTournamentAction } from "../actions";

export function TournamentActions({
  id,
  status,
  missingQuizzes,
  entries,
  cost,
}: {
  id: string;
  status: string;
  missingQuizzes: number;
  entries: number;
  cost: number;
}) {
  const { pending, run } = useActionToast();
  const [reason, setReason] = useState("");
  const live = status === "DRAFT" || status === "PUBLISHED";
  return (
    <>
      {live && missingQuizzes > 0 && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => generateQuizzesAction(id), "Cuestionarios generados.")}>
          <ListPlus /> Generar {missingQuizzes} cuestionario{missingQuizzes === 1 ? "" : "s"}
        </Button>
      )}
      {status === "DRAFT" && (
        <Button disabled={pending} onClick={() => run(() => publishTournamentAction(id), "Torneo publicado.")}>
          <Eye /> Publicar
        </Button>
      )}
      {live && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={pending}>
              <Ban /> Cancelar torneo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar el torneo?</AlertDialogTitle>
              <AlertDialogDescription>
                Se devuelven {cost} créditos a cada uno de los {entries} inscriptos y los cuestionarios que no abrieron vuelven a borrador. No se
                puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea placeholder="Motivo (obligatorio, queda en auditoría)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction disabled={!reason.trim()} onClick={() => run(() => cancelTournamentAction(id, reason), "Torneo cancelado.")}>
                Cancelar y reembolsar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
