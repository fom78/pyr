"use client";

import { createContext, useActionState, useContext, useRef, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { bulkApproveAction } from "./actions";

type Ctx = { selected: Set<string>; toggle: (id: string, on: boolean) => void };
const BulkContext = createContext<Ctx | null>(null);

/**
 * Selección masiva del listado de preguntas. `pageIds` son las aprobables de la página;
 * `filterCount` las no aprobadas de todo el filtro (para "aprobar todas las del filtro").
 */
export function BulkApprove({
  pageIds,
  filterCount,
  query,
  children,
}: {
  pageIds: string[];
  filterCount: number;
  query: string;
  children: React.ReactNode;
}) {
  const [raw, setSelected] = useState<Set<string>>(new Set());
  const [state, action, approving] = useActionState(bulkApproveAction, null);
  const filterForm = useRef<HTMLFormElement>(null);
  // Solo cuentan las de la página actual: al cambiar de página/filtro o al aprobar, las que salen se descartan.
  const selected = new Set(pageIds.filter((id) => raw.has(id)));

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  return (
    <BulkContext.Provider value={{ selected, toggle }}>
      {(pageIds.length > 0 || state) && (
        <div className="bg-background/95 sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2 text-sm backdrop-blur">
          {pageIds.length > 0 && (
            <>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={allOnPage ? true : selected.size > 0 ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(pageIds) : new Set())}
                />
                Seleccionar las {pageIds.length} sin aprobar de esta página
              </label>
              <form action={action} className="flex flex-wrap items-center gap-2">
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="id" value={id} />
                ))}
                <SubmitButton size="sm" disabled={selected.size === 0} pendingText="Aprobando…">
                  <CheckCheck /> Aprobar seleccionadas ({selected.size})
                </SubmitButton>
              </form>
              {filterCount > pageIds.length && (
                <form ref={filterForm} action={action}>
                  <input type="hidden" name="scope" value="filter" />
                  <input type="hidden" name="query" value={query} />
                  <ConfirmButton
                    size="sm"
                    variant="outline"
                    disabled={approving}
                    title={`¿Aprobar ${filterCount} preguntas?`}
                    description="Se aprueban todas las preguntas sin aprobar que cumplen los filtros actuales, en todas las páginas (no solo las que ves). Las archivadas no se tocan."
                    confirmLabel={`Aprobar ${filterCount}`}
                    onConfirm={() => filterForm.current?.requestSubmit()}
                  >
                    {approving ? "Aprobando…" : `Aprobar todas las del filtro (${filterCount})`}
                  </ConfirmButton>
                </form>
              )}
            </>
          )}
          {state && (
            <p role="status" className={state.error ? "text-destructive" : "text-success"}>
              {state.error ?? state.message}
            </p>
          )}
        </div>
      )}
      {children}
    </BulkContext.Provider>
  );
}

export function BulkCheckbox({ id, label }: { id: string; label: string }) {
  const ctx = useContext(BulkContext);
  if (!ctx) return null;
  return (
    <Checkbox
      className="mt-1"
      checked={ctx.selected.has(id)}
      onCheckedChange={(v) => ctx.toggle(id, v === true)}
      aria-label={label}
    />
  );
}
