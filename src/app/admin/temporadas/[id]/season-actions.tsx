"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Ban, Repeat2 } from "lucide-react";
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
import { archiveSeasonAction, cancelRunAction, stopRepeatAction } from "../actions";

/** Acciones de la cabecera: dejar de repetir y archivar. */
export function SeasonActions({ seasonId, repeats, archived }: { seasonId: string; repeats: boolean; archived: boolean }) {
  const { pending, run } = useActionToast();
  return (
    <>
      {repeats && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => stopRepeatAction(seasonId), "Listo.")}>
          <Repeat2 /> Dejar de repetir
        </Button>
      )}
      <Button variant="outline" disabled={pending} onClick={() => run(() => archiveSeasonAction(seasonId, !archived), "Listo.")}>
        {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Reactivar" : "Archivar"}
      </Button>
    </>
  );
}

/** Cancelar una instancia en curso: sus torneos sin empezar se cancelan con reintegro. */
export function CancelRunButton({ seasonId, runId, number }: { seasonId: string; runId: string; number: number }) {
  const { pending, run } = useActionToast();
  const [reason, setReason] = useState("");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive" disabled={pending}>
          <Ban /> Cancelar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar la instancia #{number}?</AlertDialogTitle>
          <AlertDialogDescription>
            Sus torneos que todavía no empezaron se cancelan y se reintegran las inscripciones; los que están en curso siguen. No se lanza sola la
            siguiente (la podés lanzar a mano).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (lo ven en la auditoría)" />
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction disabled={!reason.trim()} onClick={() => run(() => cancelRunAction(seasonId, runId, reason), "Instancia cancelada.")}>
            Cancelar instancia
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
