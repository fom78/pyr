import type { TicketEventKind } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, TYPE_LABEL, USER_STATUS_LABEL, type TicketStatus, type TicketType } from "@/server/tickets/rules";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<TicketStatus, string> = {
  OPEN: "bg-warning/20 text-warning-foreground dark:text-warning",
  IN_PROGRESS: "bg-primary/15 text-primary",
  ANSWERED: "bg-success/15 text-success",
  CLOSED: "bg-muted text-muted-foreground",
};

export function TicketStatusBadge({ status, forUser }: { status: TicketStatus; forUser?: boolean }) {
  return (
    <Badge className={cn("border-transparent", STATUS_CLASS[status])}>
      {(forUser ? USER_STATUS_LABEL : STATUS_LABEL)[status]}
    </Badge>
  );
}

export function TicketTypeBadge({ type }: { type: TicketType }) {
  return (
    <Badge variant="outline" className={cn(type === "BUG" && "border-destructive/40 text-destructive")}>
      {TYPE_LABEL[type]}
    </Badge>
  );
}

type Person = { id: string; name: string; username: string | null } | null;
export type TimelineEvent = {
  id: string;
  kind: TicketEventKind;
  body: string | null;
  helpful: boolean | null;
  createdAt: Date;
  actor: Person;
};

/** Eventos que ve el autor: lo que le importa (no quién lo tomó ni las notas internas). */
const USER_KINDS = new Set<TicketEventKind>(["CREATED", "ANSWERED", "FEEDBACK", "CLOSED", "REOPENED"]);

function title(e: TimelineEvent, staff: boolean, authorId: string) {
  const who = e.actor?.name ?? "Sistema";
  const team = staff ? who : "Equipo de PyR";
  switch (e.kind) {
    case "CREATED":
      return staff ? `${who} creó el ticket` : "Enviaste el reporte";
    case "TAKEN":
      return `${who} lo tomó`;
    case "RELEASED":
      return `${who} lo soltó`;
    case "ANSWERED":
      return `Respuesta de ${team}`;
    case "FEEDBACK":
      return `${e.actor?.id === authorId && !staff ? "Dijiste" : `${who} dijo`}: ${e.helpful ? "me sirvió" : "no se resolvió"}`;
    case "NOTE":
      return `Nota interna de ${who}`;
    case "CLOSED":
      return e.actor ? `${staff ? who : "El equipo"} cerró el ticket` : "Se cerró solo";
    case "REOPENED":
      return `${staff ? who : "El equipo"} reabrió el ticket`;
  }
}

export function TicketTimeline({
  events,
  staff,
  authorId,
  tz,
}: {
  events: TimelineEvent[];
  staff: boolean;
  authorId: string;
  tz: string;
}) {
  const list = staff ? events : events.filter((e) => USER_KINDS.has(e.kind));
  return (
    <ol className="grid gap-3">
      {list.map((e) => (
        <li
          key={e.id}
          className={cn(
            "grid gap-1 rounded-lg border p-3 text-sm",
            e.kind === "ANSWERED" && "border-primary/30 bg-primary/5",
            e.kind === "NOTE" && "border-dashed border-warning/50 bg-warning/10",
            e.kind === "FEEDBACK" && (e.helpful ? "border-success/30" : "border-destructive/30"),
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">{title(e, staff, authorId)}</span>
            <span className="text-muted-foreground text-xs">{formatDateTime(e.createdAt, tz)}</span>
          </div>
          {e.body && <p className="whitespace-pre-line">{e.body}</p>}
        </li>
      ))}
    </ol>
  );
}
