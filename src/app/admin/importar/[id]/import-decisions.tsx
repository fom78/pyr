"use client";

import { createContext, useContext, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { NativeSelect } from "@/components/forms/native-select";
import { cn } from "@/lib/utils";
import type { RowDecision } from "@/server/import/excel";

type Row = { row: number; similar: boolean };
type Ctx = { decisions: Record<number, RowDecision>; set: (row: number, d: RowDecision) => void; canApprove: boolean };
const DecisionContext = createContext<Ctx | null>(null);

const LABEL: Record<RowDecision, string> = { approve: "Importar aprobada", pending: "Importar pendiente", skip: "No importar" };

/**
 * Decisiones por fila de una importación: resumen en vivo, atajos por grupo
 * (filas limpias / parecidas a existentes) y un solo botón que importa lo elegido.
 */
export function ImportDecisions({
  rows,
  defaults,
  canApprove,
  invalidCount,
  commitAction,
  discardAction,
  children,
}: {
  rows: Row[];
  defaults: Record<number, RowDecision>;
  canApprove: boolean;
  invalidCount: number;
  commitAction: (fd: FormData) => Promise<void>;
  discardAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [decisions, setDecisions] = useState(defaults);
  const set = (row: number, d: RowDecision) => setDecisions((prev) => ({ ...prev, [row]: d }));
  const setGroup = (similar: boolean, d: RowDecision) =>
    setDecisions((prev) => {
      const next = { ...prev };
      for (const r of rows) if (r.similar === similar) next[r.row] = d;
      return next;
    });

  const count = (d: RowDecision) => rows.filter((r) => decisions[r.row] === d).length;
  const approve = count("approve");
  const pending = count("pending");
  const skip = count("skip");
  const toImport = approve + pending;
  const clean = rows.filter((r) => !r.similar).length;
  const similar = rows.length - clean;

  return (
    <DecisionContext.Provider value={{ decisions, set, canApprove }}>
      <div className="bg-background/95 sticky top-0 z-10 mb-4 grid gap-3 rounded-lg border p-3 text-sm backdrop-blur">
        <p aria-live="polite">
          {canApprove && (
            <>
              <strong className="text-success tabular-nums">{approve}</strong> se aprueban ·{" "}
            </>
          )}
          <strong className="tabular-nums">{pending}</strong> quedan pendientes de revisión ·{" "}
          <strong className="tabular-nums">{skip}</strong> no se importan
          {invalidCount > 0 && <span className="text-destructive"> · {invalidCount} con errores (no se importan)</span>}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {clean > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <CheckCircle2 className="text-success size-4" aria-hidden />
              Sin advertencias ({clean}):
              {canApprove && (
                <Button type="button" size="sm" variant="outline" onClick={() => setGroup(false, "approve")}>
                  Aprobar
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => setGroup(false, "pending")}>
                Pendientes
              </Button>
            </span>
          )}
          {similar > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <TriangleAlert className="text-warning size-4" aria-hidden />
              Parecidas a existentes ({similar}):
              <Button type="button" size="sm" variant="outline" onClick={() => setGroup(true, "pending")}>
                Pendientes
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setGroup(true, "skip")}>
                No importar
              </Button>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={commitAction}>
            {rows.map((r) => (
              <input key={r.row} type="hidden" name={`decision.${r.row}`} value={decisions[r.row]} />
            ))}
            <SubmitButton disabled={toImport === 0} pendingText="Importando…">
              Importar {toImport} pregunta{toImport === 1 ? "" : "s"}
            </SubmitButton>
          </form>
          <form action={discardAction}>
            <Button variant="ghost" type="submit">
              Descartar
            </Button>
          </form>
        </div>
      </div>
      {children}
    </DecisionContext.Provider>
  );
}

/** Fila de la previsualización: se atenúa si no se va a importar. */
export function DecisionRow({ row, className, children }: { row: number; className?: string; children: React.ReactNode }) {
  const ctx = useContext(DecisionContext);
  return <li className={cn(className, ctx?.decisions[row] === "skip" && "opacity-50")}>{children}</li>;
}

export function DecisionSelect({ row }: { row: number }) {
  const ctx = useContext(DecisionContext);
  if (!ctx) return null;
  const value = ctx.decisions[row];
  return (
    <NativeSelect
      value={value}
      onChange={(e) => ctx.set(row, e.target.value as RowDecision)}
      aria-label={`Qué hacer con la fila ${row}`}
      className={cn(
        "ml-auto h-8 w-auto shrink-0 text-xs",
        value === "approve" && "border-success/50 text-success",
        value === "skip" && "text-muted-foreground",
      )}
    >
      {(ctx.canApprove ? (["approve", "pending", "skip"] as const) : (["pending", "skip"] as const)).map((d) => (
        <option key={d} value={d}>
          {LABEL[d]}
        </option>
      ))}
    </NativeSelect>
  );
}
