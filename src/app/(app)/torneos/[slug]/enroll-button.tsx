"use client";

import { useState, useTransition } from "react";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { enrollAction } from "../actions";

/** Inscripción con confirmación explícita: costo, saldo resultante y reglamento. */
export function EnrollButton({
  tournamentId,
  name,
  cost,
  balance,
  rules,
}: {
  tournamentId: string;
  name: string;
  cost: number;
  balance: number;
  rules: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, start] = useTransition();
  const after = balance - cost;
  const enough = after >= 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Ticket /> Inscribirme
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inscripción a {name}</DialogTitle>
          <DialogDescription>Revisá el costo y el reglamento antes de confirmar.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-1 rounded-md bg-muted p-3 text-sm">
            <dt>Tu saldo</dt>
            <dd className="text-right tabular-nums">{balance} créditos</dd>
            <dt>Costo de inscripción</dt>
            <dd className="text-right tabular-nums">−{cost}</dd>
            <dt className="font-semibold">Saldo después</dt>
            <dd className={`text-right font-semibold tabular-nums ${enough ? "" : "text-destructive"}`}>{after} créditos</dd>
          </dl>
          {!enough && <p className="text-sm text-destructive">No te alcanzan los créditos. Jugá cuestionarios de liga para ganar más.</p>}
          <div>
            <p className="mb-2 text-sm font-medium">Reglamento</p>
            {rules}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
            Leí el reglamento y acepto que se descuenten {cost} créditos. La inscripción no usa vidas.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!accepted || !enough || pending}
            onClick={() =>
              start(async () => {
                const r = await enrollAction(tournamentId);
                if (r?.ok) {
                  toast.success(r.message);
                  setOpen(false);
                } else toast.error(r?.error);
              })
            }
          >
            Confirmar inscripción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
