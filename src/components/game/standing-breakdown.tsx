"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { standingBreakdownAction } from "@/app/(app)/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Breakdown = Awaited<ReturnType<typeof standingBreakdownAction>>;

/** Botón sobre un número de la tabla de liga: al abrirlo muestra qué cuestionarios le suman al jugador. */
export function StandingBreakdown({
  categoryId,
  userId,
  name,
  tz,
  children,
  className,
}: {
  categoryId: string;
  userId: string;
  name: string;
  tz?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [data, setData] = useState<Breakdown | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const load = (open: boolean) => {
    // Se pide cada vez que se abre: la tabla cambia apenas alguien termina un cuestionario.
    if (open) startTransition(async () => setData(await standingBreakdownAction(categoryId, userId)));
  };

  return (
    <Popover onOpenChange={load}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("cursor-pointer underline decoration-dotted underline-offset-4 hover:decoration-solid", className)}
          aria-label={`Ver qué cuestionarios le suman a ${name}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <p className="truncate text-sm font-medium">{name}</p>
          {data && (
            <p className="text-muted-foreground text-xs">
              Suman los {data.bestK} mejores de los últimos {data.windowDays} días
            </p>
          )}
        </div>
        {pending || data === undefined ? (
          <p className="text-muted-foreground px-3 py-4 text-center text-sm">Cargando…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-center text-sm">No tiene cuestionarios que sumen ahora.</p>
        ) : (
          <>
            <ul className="max-h-72 divide-y overflow-y-auto text-sm">
              {data.rows.map((r) => (
                <li key={r.id} className={cn("flex items-center gap-2 px-3 py-1.5", !r.counted && "text-muted-foreground")}>
                  <span className="w-4 shrink-0">{r.counted && <Check className="text-success size-4" aria-label="Suma" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", r.counted && "font-medium")}>{r.title}</span>
                    <span className="text-muted-foreground text-xs">
                      cierra {formatDate(r.closesAt, tz, "d/M")}
                      {!r.counted && " · no suma"}
                    </span>
                  </span>
                  <span className={cn("tabular-nums", r.counted && "font-semibold")}>{formatNumber(r.score)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t px-3 py-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatNumber(data.total)}</span>
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
