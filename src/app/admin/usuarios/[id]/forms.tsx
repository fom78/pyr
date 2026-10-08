"use client";

import { useActionState, useState } from "react";
import { Field, FormError } from "@/components/forms/field";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionToast } from "@/components/use-action-toast";
import type { FormState } from "@/server/actions";
import { adjustCreditsAction, banAction, revokeBanAction, setRoleAction } from "../actions";

function Result({ state }: { state: FormState }) {
  if (!state) return null;
  return state.ok ? <p className="text-sm text-success">{state.message}</p> : <FormError message={state.error} />;
}

export function RoleForm({ userId, role }: { userId: string; role: string }) {
  const [state, action] = useActionState(setRoleAction.bind(null, userId), null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor="role">Rol</Label>
        <NativeSelect id="role" name="role" defaultValue={role} className="w-40">
          <option value="USER">Usuario</option>
          <option value="MOD">Moderador</option>
          <option value="ADMIN">Admin</option>
        </NativeSelect>
      </div>
      <SubmitButton variant="outline">Cambiar rol</SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function BanForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(banAction.bind(null, userId), null);
  const [permanent, setPermanent] = useState(false);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="reason">Motivo (lo ve el usuario)</Label>
        <Textarea id="reason" name="reason" required minLength={3} maxLength={500} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="permanent" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} className="size-4" /> Permanente
      </label>
      {!permanent && <Field label="Hasta" name="endsAt" type="datetime-local" required />}
      <p className="text-xs text-muted-foreground">
        Se cierran sus sesiones e intentos en curso y deja de figurar en las tablas mientras dure el baneo.
      </p>
      <SubmitButton variant="destructive" className="w-fit" pendingText="Baneando…">
        Banear
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function RevokeBanButton({ userId, banId }: { userId: string; banId: string }) {
  const { pending, run } = useActionToast();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => revokeBanAction(userId, banId), "Baneo levantado.")}>
      Levantar baneo
    </Button>
  );
}

export function AdjustCreditsForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(adjustCreditsAction.bind(null, userId), null);
  return (
    <form action={action} className="grid gap-3">
      <Field label="Monto (negativo para descontar)" name="amount" type="number" step={1} required />
      <div className="grid gap-1.5">
        <Label htmlFor="adj-reason">Motivo (obligatorio, lo ve el usuario)</Label>
        <Textarea id="adj-reason" name="reason" required minLength={5} maxLength={300} />
      </div>
      <SubmitButton variant="outline" className="w-fit">
        Aplicar ajuste
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}
