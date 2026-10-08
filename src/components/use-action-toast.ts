"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { FormState } from "@/server/actions";

/** Ejecuta una server action y muestra el resultado como toast. */
export function useActionToast() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FormState | void>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r && r.ok === false) toast.error(r.error);
      else toast.success(r?.message ?? ok);
    });
  return { pending, run };
}
