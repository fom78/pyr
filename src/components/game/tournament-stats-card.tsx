import Link from "next/link";
import { Trophy } from "lucide-react";
import type { getTournamentStats } from "@/server/player/tournament-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";

const MEDAL = ["🥇", "🥈", "🥉"];

export function rankLabel(rank: number) {
  return rank <= 3 ? `${MEDAL[rank - 1]} #${rank}` : `#${rank}`;
}

function PrizeTotal({ credits, stars }: { credits: number; stars: number }) {
  return (
    <>
      {formatNumber(credits)}
      {stars > 0 && <span className="text-sm"> + {formatNumber(stars)} ⭐</span>}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 rounded-md border px-3 py-2 text-center">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

/** Premio ganado: "+150 créditos · +5 ⭐". */
export function PrizeBadge({ credits, stars }: { credits: number; stars: number }) {
  if (credits <= 0 && stars <= 0) return null;
  return (
    <span className="text-success text-xs font-medium">
      {[credits > 0 && `+${formatNumber(credits)} créditos`, stars > 0 && `+${formatNumber(stars)} ⭐`].filter(Boolean).join(" · ")}
    </span>
  );
}

/**
 * Resumen de torneos para el perfil: podios, mejor puesto, premios y últimos resultados.
 * `publicView` (perfil de otro jugador): sin premios y con textos en tercera persona.
 */
export function TournamentStatsCard({
  stats,
  tz,
  publicView = false,
}: {
  stats: Awaited<ReturnType<typeof getTournamentStats>>;
  tz: string;
  publicView?: boolean;
}) {
  const { summary: s, recent } = stats;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="text-warning size-4" aria-hidden /> Torneos
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {s.played === 0 ? (
          <p className="text-muted-foreground text-sm">
            {publicView ? (
              "Todavía no terminó ningún torneo."
            ) : (
              <>
                Todavía no terminaste ningún torneo.{" "}
                <Link href="/torneos" className="text-primary font-medium hover:underline">
                  Ver torneos abiertos
                </Link>
              </>
            )}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="jugados" value={s.played} />
              <Stat label="podios" value={`🥇${s.podiums.first} 🥈${s.podiums.second} 🥉${s.podiums.third}`} />
              <Stat label="mejor puesto" value={s.bestRank ? `#${s.bestRank}` : "—"} />
              {publicView ? (
                <Stat label="en el 10 % de arriba" value={s.topTen} />
              ) : (
                <Stat label="premios" value={<PrizeTotal credits={s.prizeCredits} stars={s.prizeStars} />} />
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              {publicView
                ? `En promedio terminó por encima del ${s.avgPercentile}% de los participantes.`
                : `Terminaste en el 10 % de arriba ${s.topTen} ${s.topTen === 1 ? "vez" : "veces"} · en promedio por encima del ${s.avgPercentile}% de los participantes.`}
            </p>
            <ul className="grid gap-1.5 text-sm">
              {recent.map((r) => (
                <li key={r.tournamentId}>
                  <Link
                    href={`/torneos/${r.tournament.slug}`}
                    className="hover:bg-accent/40 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-3 py-2"
                  >
                    <span className="w-16 font-semibold tabular-nums">{rankLabel(r.rank)}</span>
                    <span className="min-w-0 flex-1">
                      {r.tournamentName}
                      <span className="text-muted-foreground block text-xs">
                        de {r.participants} · {formatNumber(r.points)} pts · {formatDate(r.finishedAt, tz)}
                      </span>
                    </span>
                    {!publicView && <PrizeBadge credits={r.prizeCredits} stars={r.prizeStars} />}
                  </Link>
                </li>
              ))}
            </ul>
            {!publicView && (
              <Link href="/perfil/torneos" className="text-primary text-sm font-medium hover:underline">
                Ver todos mis torneos
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
