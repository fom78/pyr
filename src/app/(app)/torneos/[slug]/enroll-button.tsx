"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Ticket } from "lucide-react";
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
  const [rulesOpen, setRulesOpen] = useState(false);
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
            {/* Plegado: se ve el comienzo y se despliega a pedido, así el diálogo no se hace eterno. */}
            <div className={`relative overflow-hidden ${rulesOpen ? "" : "max-h-40"}`}>
              {rules}
              {!rulesOpen && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />}
            </div>
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setRulesOpen((o) => !o)} aria-expanded={rulesOpen}>
              {rulesOpen ? (
                <>
                  <ChevronUp /> Ver menos
                </>
              ) : (
                <>
                  <ChevronDown /> Ver el reglamento completo
                </>
              )}
            </Button>
          </div>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 text-sm font-medium transition-colors ${
              accepted ? "border-primary bg-primary/10" : "border-primary/60 bg-muted"
            }`}
          >
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5 size-5" />
            <span>
              {cost > 0
                ? `Leí el reglamento y acepto que se descuenten ${cost} créditos.`
                : "Leí el reglamento. La inscripción es gratis."}{" "}
              La inscripción no usa vidas.
            </span>
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
