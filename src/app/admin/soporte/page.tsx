import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { listTickets, TICKET_TABS, ticketTabCounts, type TicketTab } from "@/server/tickets/service";
import { TYPE_LABEL, type TicketType } from "@/server/tickets/rules";
import { EmptyState, PageHeader, str } from "@/components/common";
import { TicketStatusBadge, TicketTypeBadge } from "@/components/tickets/ticket-parts";
import { formatDateTime, fromNow } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Soporte" };

const TYPES = Object.keys(TYPE_LABEL) as TicketType[];

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("ticket.manage");
  const sp = await searchParams;
  const tab = (TICKET_TABS.find((t) => t.value === str(sp.tab))?.value ?? "untaken") as TicketTab;
  const type = TYPES.find((t) => t === str(sp.tipo));
  const [tickets, counts] = await Promise.all([listTickets({ tab, type }, user.id), ticketTabCounts(user.id)]);
  const href = (p: { tab?: string; tipo?: string | null }) => {
    const q = new URLSearchParams();
    const nextTab = p.tab ?? tab;
    const nextType = p.tipo === undefined ? type : p.tipo;
    if (nextTab !== "untaken") q.set("tab", nextTab);
    if (nextType) q.set("tipo", nextType);
    const s = q.toString();
    return `/admin/soporte${s ? `?${s}` : ""}`;
  };
  return (
    <>
      <PageHeader title="Soporte" description="Errores y sugerencias que mandan los jugadores. Tomá uno para responderlo." />
      <div className="mb-4 grid gap-3">
        <nav className="flex flex-wrap gap-1 border-b">
          {TICKET_TABS.map((t) => (
            <Link
              key={t.value}
              href={href({ tab: t.value })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                t.value === tab ? "border-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label}
              {counts[t.value] ? <span className="text-muted-foreground ml-1 tabular-nums">({counts[t.value]})</span> : null}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap gap-1.5 text-sm">
          {[null, ...TYPES].map((t) => (
            <Link
              key={t ?? "all"}
              href={href({ tipo: t })}
              className={cn("rounded-full border px-3 py-0.5", (t ?? undefined) === type ? "bg-accent font-medium" : "text-muted-foreground")}
            >
              {t ? TYPE_LABEL[t] : "Todos"}
            </Link>
          ))}
        </div>
      </div>
      {tickets.length === 0 ? (
        <EmptyState title="No hay tickets acá" />
      ) : (
        <ul className="grid gap-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/soporte/${t.id}`} className="hover:bg-accent/50 grid gap-1 rounded-lg border p-3 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">#{t.number}</span>
                  <span className="min-w-0 flex-1 font-medium">{t.title}</span>
                  <TicketTypeBadge type={t.type} />
                  <TicketStatusBadge status={t.status} />
                </span>
                <span className="text-muted-foreground text-xs">
                  {t.user.name}
                  {t.user.username && ` (@${t.user.username})`} · {formatDateTime(t.createdAt, user.timezone)} ({fromNow(t.createdAt)})
                  {t.assignee && <> · lo tiene {t.assignee.id === user.id ? "vos" : t.assignee.name}</>}
                  {t.rounds > 0 && <> · {t.rounds} respuesta{t.rounds === 1 ? "" : "s"}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
