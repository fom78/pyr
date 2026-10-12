import Link from "next/link";
import { requirePermission, userCan } from "@/server/auth/session";
import { listPendingDrafts } from "@/server/autoquiz/service";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, fromNow } from "@/lib/format";
import { DraftRowActions } from "./draft-row-actions";

export const metadata = { title: "Por aprobar" };

export default async function PendingDraftsPage() {
  const user = await requirePermission("quiz.manage");
  const [drafts, canPublish] = await Promise.all([listPendingDrafts(), userCan(user, "quiz.publish")]);
  return (
    <>
      <PageHeader
        title="Cuestionarios por aprobar"
        description="Borradores generados por los calendarios automáticos. Revisalos y aprobalos; si nadie lo hace, los completos se publican solos antes de abrir (según la configuración de la categoría) y los demás se saltean al llegar la apertura."
        back={{ href: "/admin/cuestionarios", label: "Cuestionarios" }}
      />
      {drafts.length === 0 ? (
        <EmptyState title="No hay borradores pendientes" description="Cuando el worker genere los próximos, aparecen acá." />
      ) : (
        <div className="grid gap-3">
          {drafts.map((d) => {
            const complete = d.questions === d.expected;
            return (
              <Card key={d.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <Link href={`/admin/cuestionarios/${d.id}`} className="font-medium hover:underline">
                      {d.category.icon} {d.title}
                    </Link>
                    <p className="text-muted-foreground text-sm">
                      Abre {formatDateTime(d.opensAt, user.timezone)} ({fromNow(d.opensAt)}) · {d.questions}/{d.expected}{" "}
                      preguntas
                      {d.autoPublishAt && complete
                        ? ` · si nadie lo aprueba se publica solo el ${formatDateTime(d.autoPublishAt, user.timezone)}`
                        : " · si nadie lo aprueba, el turno se saltea"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.urgent && <Badge variant="destructive">Urgente</Badge>}
                      {!complete && <Badge variant="destructive">Incompleto</Badge>}
                      {d.reused > 0 && <Badge variant="outline">{d.reused} reutilizada(s)</Badge>}
                      {complete && !d.urgent && d.reused === 0 && <Badge variant="secondary">Listo para revisar</Badge>}
                    </div>
                  </div>
                  <DraftRowActions id={d.id} canPublish={canPublish && complete} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
