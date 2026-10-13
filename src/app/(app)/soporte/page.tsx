import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listMyTickets } from "@/server/tickets/service";
import { EmptyState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { TicketStatusBadge, TicketTypeBadge } from "@/components/tickets/ticket-parts";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Soporte" };

export default async function SupportPage() {
  const user = await requireUser();
  const tickets = await listMyTickets(user.id);
  const action = (
    <Button asChild>
      <Link href="/soporte/nuevo">
        <Plus /> Nuevo reporte
      </Link>
    </Button>
  );
  return (
    <>
      <PageHeader
        title="Reportes y sugerencias"
        description="Contanos si algo no funciona o qué mejorarías. El equipo los lee todos y te responde acá."
        actions={action}
      />
      {tickets.length === 0 ? (
        <EmptyState title="Todavía no enviaste ninguno" description="Si encontrás un error o tenés una idea para el juego, mandalo." action={action} />
      ) : (
        <ul className="grid gap-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/soporte/${t.id}`} className="hover:bg-accent/40 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
                <span className="text-muted-foreground tabular-nums">#{t.number}</span>
                <span className="min-w-0 flex-1 font-medium">{t.title}</span>
                <TicketTypeBadge type={t.type} />
                <TicketStatusBadge status={t.status} forUser />
                <span className="text-muted-foreground text-xs">{formatDate(t.createdAt, user.timezone)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
