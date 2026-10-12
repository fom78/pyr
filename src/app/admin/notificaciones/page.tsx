import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { listNotifications } from "@/server/notifications/service";
import { EmptyState, PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MarkSeen, NotificationRow } from "./mark-seen";

export const metadata = { title: "Notificaciones" };

const LEVEL_DOT = { INFO: "bg-primary", WARNING: "bg-warning", CRITICAL: "bg-destructive" } as const;

export default async function NotificationsPage() {
  const user = await requirePermission("admin.access");
  const items = await listNotifications(user.id, { take: 100 });
  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="Avisos del sistema: banco de preguntas bajo, borradores por aprobar, publicaciones automáticas, turnos salteados. Se marcan como leídas al abrir esta página."
      />
      {items.length === 0 ? (
        <EmptyState title="Sin notificaciones" />
      ) : (
        <MarkSeen unreadIds={unreadIds}>
          <Card>
            <CardContent className="grid gap-0 p-0">
              {items.map((n) => (
                <NotificationRow key={n.id} id={n.id} className="flex gap-3 border-b px-4 py-3 last:border-0">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", LEVEL_DOT[n.level])} aria-hidden />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="font-medium">
                      {n.href ? (
                        <Link href={n.href} className="hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    {n.body && <p className="text-muted-foreground text-sm">{n.body}</p>}
                    <p className="text-muted-foreground text-xs">{formatDateTime(n.createdAt, user.timezone)}</p>
                  </div>
                </NotificationRow>
              ))}
            </CardContent>
          </Card>
        </MarkSeen>
      )}
    </>
  );
}
