"use client";

import { useTransition } from "react";
import { Heart, LogOut } from "lucide-react";
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
import { joinCategoryAction, leaveCategoryAction } from "@/app/(app)/actions";

/** Inscribirse: muestra cuántas vidas quedan y que salir tiene desvinculación. */
export function JoinButton({
  categoryId,
  categoryName,
  livesFree,
  livesMax,
  cooldownDays,
  size = "default",
}: {
  categoryId: string;
  categoryName: string;
  livesFree: number;
  livesMax: number;
  cooldownDays: number;
  size?: "default" | "sm" | "lg";
}) {
  const [pending, start] = useTransition();
  if (livesFree <= 0)
    return (
      <Button size={size} variant="outline" disabled title="No te quedan vidas libres">
        <Heart /> Sin vidas libres
      </Button>
    );
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size={size} disabled={pending}>
          <Heart /> Participar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Participar en {categoryName}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2">
              <p>
                Vas a usar <strong>1 de tus {livesMax} vidas</strong>. Te quedarían <strong>{livesFree - 1}</strong> libres.
              </p>
              <p>
                Si más adelante querés salir, la vida queda en desvinculación {cooldownDays} días antes de poder usarla en otra categoría.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              start(async () => {
                const r = await joinCategoryAction(categoryId);
                if (r?.ok) toast.success(r.message);
                else toast.error(r?.error);
              })
            }
          >
            Sí, participar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Abandonar: explica qué pasa con la vida, hasta cuándo no puede volver y que deja de figurar. */
export function LeaveButton({
  categoryId,
  categoryName,
  cooldownDays,
  release,
  rejoin,
}: {
  categoryId: string;
  categoryName: string;
  cooldownDays: number;
  /** Fechas ya formateadas (se calculan en el servidor). */
  release: string;
  rejoin: string;
}) {
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending} className="text-muted-foreground">
          <LogOut /> Abandonar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Abandonar {categoryName}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="ml-4 grid list-disc gap-1.5">
              <li>Dejás de poder jugar sus cuestionarios desde ahora.</li>
              <li>Tu puntaje deja de figurar en la tabla (tu historial se conserva).</li>
              <li>
                La vida se libera el <strong>{release}</strong> ({cooldownDays} días de desvinculación).
              </li>
              <li>
                No vas a poder volver a {categoryName} hasta el <strong>{rejoin}</strong>.
              </li>
              <li>Esta acción no se puede deshacer.</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Me quedo</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() =>
              start(async () => {
                const r = await leaveCategoryAction(categoryId);
                if (r?.ok) toast.success(r.message);
                else toast.error(r?.error);
              })
            }
          >
            Abandonar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
