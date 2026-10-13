"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useActionToast } from "@/components/use-action-toast";
import type { FormState } from "@/server/actions";
import type { TicketAction } from "@/server/tickets/rules";
import { answerTicketAction, closeTicketAction, noteTicketAction, ticketQuickAction } from "../actions";

type Props = {
  ticketId: string;
  actions: TicketAction[];
  rounds: number;
  maxRounds: number;
  /** Nombre de quien lo tiene, si no es quien mira. */
  assignedToOther: string | null;
};

export function TicketActions({ ticketId, actions, rounds, maxRounds, assignedToOther }: Props) {
  const { pending, run } = useActionToast();
  const has = (a: TicketAction) => actions.includes(a);
  const quick = (a: "take" | "release" | "reopen", label: string, variant: "default" | "outline" = "outline") =>
    has(a) && (
      <Button variant={variant} disabled={pending} onClick={() => run(() => ticketQuickAction(ticketId, a), "Listo.")}>
        {label}
      </Button>
    );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {quick("take", assignedToOther ? `Tomarlo (lo tiene ${assignedToOther})` : "Tomar", "default")}
        {quick("release", "Soltar")}
        {quick("reopen", "Reabrir")}
      </div>
      {has("answer") && (
        <TextForm
          title="Responder al usuario"
          description={`Le llega un aviso. Respuesta ${rounds + 1} de ${maxRounds}: después puede decir si le sirvió.`}
          action={answerTicketAction.bind(null, ticketId)}
          submit="Enviar respuesta"
          rows={5}
          required
        />
      )}
      {has("note") && (
        <TextForm
          title="Nota interna"
          description="Solo la ve el equipo."
          action={noteTicketAction.bind(null, ticketId)}
          submit="Guardar nota"
          variant="outline"
          rows={2}
          required
        />
      )}
      {has("close") && (
        <TextForm
          title="Cerrar ticket"
          description="Mensaje opcional para el usuario (por ejemplo, por qué no se va a hacer)."
          action={closeTicketAction.bind(null, ticketId)}
          submit="Cerrar"
          variant="outline"
          rows={2}
        />
      )}
    </div>
  );
}

function TextForm({
  title,
  description,
  action,
  submit,
  variant,
  rows,
  required,
}: {
  title: string;
  description: string;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  submit: string;
  variant?: "outline";
  rows: number;
  required?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={formAction} className="grid gap-2">
          <FormError message={state?.error} />
          <Textarea name="body" rows={rows} required={required} maxLength={4000} defaultValue={state?.ok ? "" : state?.values?.body} />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton variant={variant} pendingText="Guardando…">
              {submit}
            </SubmitButton>
            {state?.ok && state.message && <span className="text-success text-sm">{state.message}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
