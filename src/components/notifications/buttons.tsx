"use client";

import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/use-action-toast";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

export function MarkAllReadButton({ audience, unread }: { audience: "STAFF" | "PLAYER"; unread: number }) {
  const { pending, run } = useActionToast();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || unread === 0}
      onClick={() => run(() => markAllNotificationsReadAction(audience), "Listo.")}
    >
      <CheckCheck aria-hidden /> Marcar todas como leídas
    </Button>
  );
}

export function MarkReadButton({ id }: { id: string }) {
  const { pending, run } = useActionToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 shrink-0 px-2 text-xs"
      disabled={pending}
      onClick={() => run(() => markNotificationReadAction(id), "Marcada como leída.")}
    >
      Marcar como leída
    </Button>
  );
}
