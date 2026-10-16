"use client";

import { Heart } from "lucide-react";
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
import { useActionToast } from "@/components/use-action-toast";
import { exchangeStarsAction } from "@/app/(app)/actions";

/** Canjear estrellas por una vida (con confirmación: no se puede deshacer). */
export function ExchangeButton({ cost, disabledReason }: { cost: number; disabledReason: string | null }) {
  const { pending, run } = useActionToast();
  if (disabledReason)
    return (
      <div className="grid gap-1">
        <Button variant="outline" disabled className="w-fit">
          <Heart /> Canjear {cost} ⭐ por una vida
        </Button>
        <span className="text-muted-foreground text-xs">{disabledReason}</span>
      </div>
    );
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={pending} className="w-fit">
          <Heart /> Canjear {cost} ⭐ por una vida
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desbloquear una vida?</AlertDialogTitle>
          <AlertDialogDescription>
            Usás {cost} estrellas y sumás una vida para siempre: vas a poder participar en una categoría más.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(exchangeStarsAction, "Vida desbloqueada.")}>Canjear</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
