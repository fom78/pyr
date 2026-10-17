"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmQualificationAction } from "../actions";

/** Clasificado sin confirmar: un toque y queda adentro (no cuesta créditos). */
export function ConfirmQualificationButton({ tournamentId }: { tournamentId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await confirmQualificationAction(tournamentId);
          if (r?.ok) toast.success(r.message);
          else toast.error(r?.error ?? "No se pudo confirmar.");
        })
      }
    >
      {pending ? "Confirmando…" : "Confirmar mi lugar (gratis)"}
    </Button>
  );
}
