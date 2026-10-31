"use client";

import { createContext, useActionState, useContext, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/forms/submit-button";
import { publishDraftsAction } from "../actions";

type Ctx = { selected: Set<string>; toggle: (id: string, on: boolean) => void };
const BulkContext = createContext<Ctx | null>(null);

/** Aprobación masiva de "Por aprobar": `ids` son los borradores completos que se ven con el filtro actual. */
export function BulkPublish({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [raw, setSelected] = useState<Set<string>>(new Set());
  const [state, action] = useActionState(publishDraftsAction, null);
  // Solo cuentan los visibles: al filtrar o aprobar, los que salen se descartan solos.
  const selected = new Set(ids.filter((id) => raw.has(id)));
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <BulkContext.Provider value={{ selected, toggle }}>
      {(ids.length > 0 || state) && (
        <div className="bg-background/95 sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2 text-sm backdrop-blur">
          {ids.length > 0 && (
            <>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={all ? true : selected.size > 0 ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(ids) : new Set())}
                />
                Seleccionar los {ids.length} completos que se ven
              </label>
              <form action={action}>
                {[...selected].map((id) => (
                  <input key={id} type="hidden" name="id" value={id} />
                ))}
                <SubmitButton size="sm" disabled={selected.size === 0} pendingText="Aprobando…">
                  <CheckCheck /> Aprobar seleccionados ({selected.size})
                </SubmitButton>
              </form>
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
  return <Checkbox checked={ctx.selected.has(id)} onCheckedChange={(v) => ctx.toggle(id, v === true)} aria-label={label} />;
}
