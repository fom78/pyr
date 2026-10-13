"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/use-action-toast";
import { requestBackupAction } from "./actions";

export function CreateBackupButton({ busy }: { busy: boolean }) {
  const { pending, run } = useActionToast();
  return (
    <Button disabled={pending || busy} onClick={() => run(() => requestBackupAction(), "Backup pedido.")}>
      <DatabaseBackup /> {busy ? "Backup en curso…" : "Crear backup ahora"}
    </Button>
  );
}

/** Mientras haya un backup pendiente o en curso, refresca la página cada 5 s. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
