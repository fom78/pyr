import { requirePermission } from "@/server/auth/session";
import { listNotifications } from "@/server/notifications/service";
import { PageHeader } from "@/components/common";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const user = await requirePermission("admin.access");
  const items = await listNotifications(user.id, "STAFF", { take: 100 });
  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="Avisos del sistema: banco de preguntas bajo, borradores por aprobar, turnos sin cuestionario, publicaciones automáticas. Cada una se marca como leída al abrirla."
      />
      <NotificationList items={items} tz={user.timezone} audience="STAFF" />
    </>
  );
}
