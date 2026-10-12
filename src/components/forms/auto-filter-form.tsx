"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Formulario GET de filtros que se aplica solo: al cambiar un select/checkbox al instante,
 * al escribir con una pequeña espera. Sin JS sigue funcionando con Enter.
 */
export function AutoFilterForm({
  children,
  className,
  delayMs = 400,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function apply() {
    clearTimeout(timer.current);
    const form = ref.current;
    if (!form) return;
    const sp = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) {
      if (typeof v === "string" && v.trim()) sp.set(k, v.trim());
    }
    const qs = sp.toString(); // sin "page": un filtro nuevo vuelve a la página 1
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function isText(t: EventTarget) {
    return t instanceof HTMLInputElement && (t.type === "text" || t.type === "search");
  }

  return (
    <form
      ref={ref}
      role="search"
      aria-busy={pending}
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      onChange={(e) => {
        if (!isText(e.target)) apply();
      }}
      onInput={(e) => {
        if (!isText(e.target)) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(apply, delayMs);
      }}
    >
      {children}
      {pending && <Loader2 className="text-muted-foreground absolute top-3 right-3 size-4 animate-spin" aria-label="Filtrando" />}
    </form>
  );
}
