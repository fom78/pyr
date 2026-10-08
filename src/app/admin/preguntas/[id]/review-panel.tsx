"use client";

import { useActionState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/forms/field";
import { reviewQuestionAction } from "../actions";
import type { ReviewStatus } from "@/generated/prisma/enums";

export function ReviewPanel({ id, status, comment }: { id: string; status: ReviewStatus; comment: string | null }) {
  const [state, action, pending] = useActionState(reviewQuestionAction.bind(null, id), null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revisión</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3">
          <FormError message={state?.error} />
          {state?.message && <p className="text-sm text-success">{state.message}</p>}
          <div className="grid gap-1.5">
            <Label htmlFor="comment">Comentario (obligatorio al rechazar)</Label>
            <Textarea id="comment" name="comment" defaultValue={comment ?? ""} maxLength={500} />
          </div>
          <div className="flex flex-wrap gap-2">
            {status !== "APPROVED" && (
              <Button type="submit" name="decision" value="APPROVED" disabled={pending} size="sm">
                <Check /> Aprobar
              </Button>
            )}
            {status !== "REJECTED" && (
              <Button type="submit" name="decision" value="REJECTED" variant="destructive" disabled={pending} size="sm">
                <X /> Rechazar
              </Button>
            )}
            {status !== "PENDING_REVIEW" && (
              <Button type="submit" name="decision" value="PENDING_REVIEW" variant="outline" disabled={pending} size="sm">
                <RotateCcw /> Volver a pendiente
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
