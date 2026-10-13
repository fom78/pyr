import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getTicket } from "@/server/tickets/service";
import { canTicket, MAX_ROUNDS } from "@/server/tickets/rules";
import { fileUrl } from "@/server/storage";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { TicketStatusBadge, TicketTimeline, TicketTypeBadge } from "@/components/tickets/ticket-parts";
import { formatDateTime } from "@/lib/format";
import { FeedbackForm } from "./feedback-form";

export const metadata = { title: "Reporte" };

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enviado?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  // En la vista del jugador nunca se muestran notas internas, aunque el autor sea del equipo.
  const viewer = { id: user.id, staff: false };
  const t = await getTicket(id, viewer);
  if (!t) notFound();
  const sent = (await searchParams).enviado === "1";
  const image = fileUrl(t.imageKey);
  const lastRound = t.rounds >= MAX_ROUNDS;
  return (
    <>
      <PageHeader
        back={{ href: "/soporte", label: "Reportes" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground tabular-nums">#{t.number}</span> {t.title}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <TicketTypeBadge type={t.type} />
            <TicketStatusBadge status={t.status} forUser />
          </div>
        }
      />
      <div className="grid gap-6">
        {sent && (
          <p className="border-success/30 bg-success/10 flex items-center gap-2 rounded-lg border p-3 text-sm">
            <CheckCircle2 className="text-success size-4" aria-hidden />
            ¡Gracias! Lo recibimos. Cuando el equipo te responda te va a llegar un aviso a la campanita.
          </p>
        )}
        <Card>
          <CardContent className="grid gap-3 py-4 text-sm">
            <p className="whitespace-pre-line">{t.body}</p>
            {image && (
              <a href={image} target="_blank" rel="noreferrer" className="block w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Captura adjunta" className="max-h-80 rounded-md border" />
              </a>
            )}
            <p className="text-muted-foreground text-xs">Enviado el {formatDateTime(t.createdAt, user.timezone)}</p>
          </CardContent>
        </Card>
        <section className="grid gap-2">
          <h2 className="font-semibold">Seguimiento</h2>
          <TicketTimeline events={t.events.filter((e) => e.kind !== "CREATED")} staff={false} authorId={t.userId} tz={user.timezone} />
          {t.events.every((e) => e.kind === "CREATED") && (
            <p className="text-muted-foreground text-sm">Todavía no hay respuesta del equipo.</p>
          )}
        </section>
        {canTicket(t, viewer, "feedback") && <FeedbackForm ticketId={t.id} lastRound={lastRound} />}
      </div>
    </>
  );
}
