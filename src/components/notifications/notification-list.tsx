import type { Notification } from "@/generated/prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MarkAllReadButton, MarkReadButton } from "./buttons";

const LEVEL_DOT = { INFO: "bg-primary", WARNING: "bg-warning", CRITICAL: "bg-destructive" } as const;

/**
 * Lista de notificaciones (panel y juego). Entrar a la lista no marca nada: cada una se marca
 * al abrirla (pasa por /api/notifications/<id>/open) o con "Marcar como leída" si no tiene link.
 */
export function NotificationList({
  items,
  tz,
  audience,
}: {
  items: Notification[];
  tz: string;
  audience: "STAFF" | "PLAYER";
}) {
  const unread = items.filter((n) => !n.readAt).length;
  if (!items.length) return <EmptyState title="Sin notificaciones" />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {unread ? `${unread} sin leer` : "Todas leídas"} · {items.length} en total
        </p>
        <MarkAllReadButton audience={audience} unread={unread} />
      </div>
      <Card>
        <CardContent className="grid gap-0 p-0">
          {items.map((n) => {
            const isNew = !n.readAt;
            const content = (
              <>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", LEVEL_DOT[n.level], !isNew && "opacity-40")} aria-hidden />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={cn(isNew ? "font-semibold" : "font-medium")}>{n.title}</span>
                  {n.body && <span className="text-muted-foreground text-sm whitespace-pre-line">{n.body}</span>}
                  <span className="text-muted-foreground text-xs">{formatDateTime(n.createdAt, tz)}</span>
                </span>
              </>
            );
            return (
              <div
                key={n.id}
                className={cn("flex items-start gap-2 border-b last:border-0", isNew ? "bg-primary/5" : "text-muted-foreground/90")}
              >
                {n.href ? (
                  // <a> común y no <Link>: el prefetch no debe marcarla como leída.
                  <a href={`/api/notifications/${n.id}/open`} className="hover:bg-accent/50 flex min-w-0 flex-1 gap-3 px-4 py-3">
                    {content}
                  </a>
                ) : (
                  <div className="flex min-w-0 flex-1 gap-3 px-4 py-3">{content}</div>
                )}
                {isNew && (
                  <div className="flex shrink-0 items-center gap-1 py-3 pr-3">
                    <span className="text-primary text-xs font-medium">Nueva</span>
                    {!n.href && <MarkReadButton id={n.id} />}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
