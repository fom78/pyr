"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";

function snapshot(form: HTMLFormElement) {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
}

/**
 * Detecta si un formulario tiene cambios sin guardar comparando su contenido con el
 * último guardado. `savedKey` cambia después de cada envío (p. ej. el estado de la action)
 * para tomar una nueva referencia. Mientras haya cambios avisa antes de salir de la página.
 */
export function useUnsavedChanges(savedKey: unknown) {
  const ref = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    baseline.current = snapshot(form);
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      // Esperar a que los controles (switches, uploads) terminen de actualizar el DOM.
      frame = requestAnimationFrame(() => setDirty(snapshot(form) !== baseline.current));
    };
    check();
    form.addEventListener("input", check);
    form.addEventListener("change", check);
    form.addEventListener("click", check);
    const observer = new MutationObserver(check);
    observer.observe(form, { subtree: true, attributes: true, attributeFilter: ["value", "data-state"] });
    return () => {
      cancelAnimationFrame(frame);
      form.removeEventListener("input", check);
      form.removeEventListener("change", check);
      form.removeEventListener("click", check);
      observer.disconnect();
    };
  }, [savedKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { ref, dirty };
}

export function UnsavedBadge({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return (
    <span className="text-warning-foreground dark:text-warning inline-flex items-center gap-1 text-sm" role="status">
      <CircleAlert className="size-4" aria-hidden />
      Cambios sin guardar
    </span>
  );
}
