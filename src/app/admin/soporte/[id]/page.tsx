import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { getTicket } from "@/server/tickets/service";
import { allowedTicketActions, MAX_ROUNDS } from "@/server/tickets/rules";
import { fileUrl } from "@/server/storage";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { TicketStatusBadge, TicketTimeline, TicketTypeBadge } from "@/components/tickets/ticket-parts";
import { formatDateTime } from "@/lib/format";
import { TicketActions } from "./ticket-actions";

export const metadata = { title: "Ticket" };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("ticket.manage");
  const { id } = await params;
  const viewer = { id: user.id, staff: true };
  const t = await getTicket(id, viewer);
  if (!t) notFound();
  const image = fileUrl(t.imageKey);
  const actions = allowedTicketActions(t, viewer);
  return (
    <>
      <PageHeader
        back={{ href: "/admin/soporte", label: "Soporte" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground tabular-nums">#{t.number}</span> {t.title}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <TicketTypeBadge type={t.type} />
            <TicketStatusBadge status={t.status} />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-3 py-4 text-sm">
              <p className="whitespace-pre-line">{t.body}</p>
              {image && (
                <a href={image} target="_blank" rel="noreferrer" className="block w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="Captura adjunta" className="max-h-96 rounded-md border" />
                </a>
              )}
            </CardContent>
          </Card>
          <section className="grid gap-2">
            <h2 className="font-semibold">Historial</h2>
            <TicketTimeline events={t.events} staff authorId={t.userId} tz={user.timezone} />
          </section>
          <TicketActions
            ticketId={t.id}
            actions={actions}
            rounds={t.rounds}
            maxRounds={MAX_ROUNDS}
            assignedToOther={t.assignee && t.assignee.id !== user.id ? t.assignee.name : null}
          />
        </div>
        <Card className="h-fit">
          <CardContent className="grid gap-3 py-4 text-sm">
            <Info label="Usuario">
              <Link href={`/admin/usuarios/${t.user.id}`} className="font-medium hover:underline">
                {t.user.name}
                {t.user.username && ` (@${t.user.username})`}
              </Link>
            </Info>
            <Info label="Enviado">{formatDateTime(t.createdAt, user.timezone)}</Info>
            <Info label="Lo tiene">{t.assignee ? (t.assignee.id === user.id ? "Vos" : t.assignee.name) : "Nadie"}</Info>
            <Info label="Respuestas">
              {t.rounds} de {MAX_ROUNDS}
            </Info>
            {t.pageUrl && (
              <Info label="Página">
                <a href={t.pageUrl} target="_blank" rel="noreferrer" className="break-all hover:underline">
                  {t.pageUrl}
                </a>
              </Info>
            )}
            {t.userAgent && (
              <Info label="Navegador">
                <span className="text-muted-foreground text-xs break-all">{t.userAgent}</span>
              </Info>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{children}</span>
    </div>
  );
}
