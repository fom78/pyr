"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { markReadAction } from "./actions";

const NewContext = createContext<Set<string>>(new Set());

/**
 * Al abrir la página marca como leídas las no leídas (así se va el contador del menú),
 * pero durante esta visita las sigue mostrando como nuevas.
 */
export function MarkSeen({ unreadIds, children }: { unreadIds: string[]; children: React.ReactNode }) {
  const [fresh] = useState(() => new Set(unreadIds));
  useEffect(() => {
    if (fresh.size) void markReadAction([...fresh]);
  }, [fresh]);
  return <NewContext.Provider value={fresh}>{children}</NewContext.Provider>;
}

export function NotificationRow({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const isNew = useContext(NewContext).has(id);
  return (
    <div className={cn(className, isNew ? "bg-primary/5" : "opacity-60")}>
      {children}
      {isNew && <span className="text-primary shrink-0 text-xs font-medium">Nueva</span>}
    </div>
  );
}
