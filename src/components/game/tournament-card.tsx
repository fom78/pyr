import Link from "next/link";
import { Trophy, Users } from "lucide-react";
import { fileUrl } from "@/server/storage";
import type { TournamentCardData } from "@/server/tournaments/hub";
import { currentRound } from "@/server/tournaments/listing";
import { isQualifiersOnly, registrationState } from "@/server/tournaments/registration";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Línea de estado según el momento: lo que le sirve saber al jugador para decidir. */
function statusLine(t: TournamentCardData, now: Date, tz: string, rank: number | undefined) {
  const ko = t.format === "KNOCKOUT";
  if (t.status === "FINISHED") return rank ? `Terminaste ${rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] + " " : ""}#${rank}` : null;
  if (t.startsAt <= now) {
    const round = `${ko ? "Ronda" : "Fecha"} ${currentRound(t, now)} de ${t.quizCount}`;
    return registrationState(t, now) === "OPEN" && !isQualifiersOnly(t)
      ? `${round} · todavía te podés sumar hasta el ${formatDateTime(t.registrationEndsAt, tz)}`
      : `${round} · termina el ${formatDate(t.endsAt, tz)}`;
  }
  if (isQualifiersOnly(t)) return `Se entra por clasificación · empieza el ${formatDateTime(t.startsAt, tz)}`;
  const reg = registrationState(t, now);
  if (reg === "OPEN") return `Inscripción hasta el ${formatDateTime(t.registrationEndsAt, tz)}`;
  if (reg === "NOT_YET") return `Inscripción desde el ${formatDateTime(t.registrationOpensAt, tz)}`;
  return `Empieza el ${formatDateTime(t.startsAt, tz)}`;
}

export function TournamentCard({
  t,
  now,
  tz,
  mine,
  rank,
  dim,
}: {
  t: TournamentCardData;
  now: Date;
  tz: string;
  mine: boolean;
  rank?: number;
  /** Ya empezado y sin lugar para sumarse: se muestra apagado. */
  dim?: boolean;
}) {
  const img = fileUrl(t.imageKey);
  const qualifiersOnly = isQualifiersOnly(t);
  const line = statusLine(t, now, tz, rank);
  return (
    <Link
      href={`/torneos/${t.slug}`}
      className={cn("hover:border-primary/60 overflow-hidden rounded-lg border transition-colors", dim && "opacity-70")}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="aspect-[2/1] w-full object-cover" />
      ) : (
        <div className="from-primary/30 to-warning/20 flex aspect-[3/1] items-center justify-center bg-gradient-to-br">
          <Trophy className="text-warning size-10" />
        </div>
      )}
      <div className="grid gap-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t.name}</span>
          {t.format === "KNOCKOUT" && <Badge variant="secondary">⚔️ Eliminatoria</Badge>}
          {t.seasonRun && (
            <Badge variant="outline">
              📅 {t.seasonRun.season.name} #{t.seasonRun.number}
            </Badge>
          )}
          {mine && t.status === "PUBLISHED" && <Badge>Inscripto</Badge>}
          {!mine && t.status === "PUBLISHED" && qualifiersOnly && <Badge variant="outline">Por clasificación</Badge>}
        </div>
        <p className="text-muted-foreground text-xs">
          {t.categories.map((c) => `${c.category.icon ?? ""} ${c.category.name}`).join(" · ")}
        </p>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
          <span>
            {formatDate(t.startsAt, tz)} → {formatDate(t.endsAt, tz)}
          </span>
          {!qualifiersOnly && <span>🪙 {t.entryCost === 0 ? "gratis" : `${t.entryCost} créditos`}</span>}
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" /> {t._count.entries}
            {t.maxParticipants ? `/${t.maxParticipants}` : ""}
          </span>
        </p>
        {line && <p className="text-xs font-medium">{line}</p>}
      </div>
    </Link>
  );
}
