import { requireUser } from "@/server/auth/session";
import { listNotifications } from "@/server/notifications/service";
import { PageHeader } from "@/components/common";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata = { title: "Notificaciones" };

export default async function PlayerNotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id, "PLAYER", { take: 100 });
  return (
    <>
      <PageHeader title="Notificaciones" description="Avisos del juego, por ejemplo cuando ya podés ver la corrección de un cuestionario que jugaste." />
      <NotificationList items={items} tz={user.timezone} audience="PLAYER" />
    </>
  );
}
