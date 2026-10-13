"use client";

import { useActionState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ticketFeedbackAction } from "../actions";

/** Un feedback por respuesta: no es un chat. */
export function FeedbackForm({ ticketId, lastRound }: { ticketId: string; lastRound: boolean }) {
  const [state, action] = useActionState(ticketFeedbackAction.bind(null, ticketId), null);
  if (state?.ok) return <p className="text-success text-sm">{state.message}</p>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Te sirvió la respuesta?</CardTitle>
        <CardDescription>
          {lastRound
            ? "Es la última respuesta de este ticket: si sigue pasando, abrí uno nuevo."
            : "Si no se resolvió, el equipo lo vuelve a mirar."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3">
          <FormError message={state?.error} />
          <div className="grid gap-1.5">
            <Label htmlFor="comment">Comentario (opcional)</Label>
            <Textarea id="comment" name="comment" rows={3} maxLength={500} defaultValue={state?.values?.comment} />
            {state?.fieldErrors?.comment?.map((e) => (
              <p key={e} className="text-destructive text-sm">
                {e}
              </p>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="helpful" value="yes">
              <ThumbsUp /> Me sirvió
            </SubmitButton>
            <SubmitButton name="helpful" value="no" variant="outline">
              <ThumbsDown /> No se resolvió
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
