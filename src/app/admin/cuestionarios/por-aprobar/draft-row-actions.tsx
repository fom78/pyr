"use client";

import Link from "next/link";
import { Check, Eye, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/use-action-toast";
import { ConfirmButton } from "@/components/confirm-button";
import { publishQuizAction, skipDraftAction } from "../actions";

export function DraftRowActions({ id, canPublish }: { id: string; canPublish: boolean }) {
  const { pending, run } = useActionToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href={`/admin/cuestionarios/${id}`}>
          <Eye /> Revisar
        </Link>
      </Button>
      {canPublish && (
        <ConfirmButton
          size="sm"
          disabled={pending}
          title="¿Aprobar este cuestionario?"
          description="Queda programado y se abre a su hora. Hasta que abra lo podés despublicar."
          confirmLabel="Aprobar"
          onConfirm={() => run(() => publishQuizAction(id), "Cuestionario aprobado.")}
        >
          <Check /> Aprobar
        </ConfirmButton>
      )}
      <ConfirmButton
        size="sm"
        variant="ghost"
        disabled={pending}
        title="¿Saltear este turno?"
        description="El borrador se borra, sus preguntas vuelven al banco y ese turno no se vuelve a generar."
        confirmLabel="Saltear"
        destructive
        onConfirm={() => run(() => skipDraftAction(id), "Turno salteado.")}
      >
        <SkipForward /> Saltear
      </ConfirmButton>
    </div>
  );
}
