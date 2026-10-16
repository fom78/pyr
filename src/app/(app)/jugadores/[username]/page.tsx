import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getPublicProfile } from "@/server/player/public-profile";
import { fileUrl } from "@/server/storage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TournamentStatsCard } from "@/components/game/tournament-stats-card";
import { formatDate, formatNumber } from "@/lib/format";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)}` };
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 rounded-md border px-3 py-2 text-center">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

/** Perfil público de un jugador: lo que ve cualquier otro (sin créditos, vidas ni estrellas). */
export default async function PlayerPage({ params }: Props) {
  const me = await requireUser();
  const { username } = await params;
  const p = await getPublicProfile(decodeURIComponent(username));
  if (!p) notFound();
  const { user, stats, league, tournaments } = p;
  const isMe = user.id === me.id;
  const image = fileUrl(user.image);

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-16">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback className="text-lg">{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {user.name}
            {user.role !== "USER" && <Badge variant="secondary">{user.role === "ADMIN" ? "Equipo PyR" : "Moderador/a"}</Badge>}
          </h1>
          <p className="text-muted-foreground text-sm">
            @{user.displayUsername ?? user.username} · juega desde {formatDate(user.createdAt, me.timezone)}
          </p>
        </div>
        {isMe && (
          <Button asChild variant="outline" size="sm">
            <Link href="/perfil">Editar perfil</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="cuestionarios" value={formatNumber(stats.quizzes)} />
        <Stat label="aciertos" value={stats.accuracy === null ? "—" : `${stats.accuracy}%`} />
        <Stat label={stats.activeCategories === 1 ? "categoría" : "categorías"} value={stats.activeCategories} />
        <Stat label="mejor racha" value={stats.bestStreak} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liga</CardTitle>
        </CardHeader>
        <CardContent>
          {league.length === 0 ? (
            <p className="text-muted-foreground text-sm">No está participando en ninguna categoría.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {league.map((l) => (
                <li key={l.category.id}>
                  <Link
                    href={`/categorias/${l.category.slug}/tabla`}
                    className="hover:bg-accent/40 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-3 py-2"
                  >
                    <span aria-hidden>{l.category.icon}</span>
                    <span className="min-w-0 flex-1">
                      {l.category.name}
                      <span className="text-muted-foreground block text-xs">
                        {l.rank ? `#${l.rank} de ${l.participants} · ${formatNumber(l.points ?? 0)} pts` : "Todavía sin puntaje"}
                      </span>
                    </span>
                    {l.streak > 0 && (
                      <span className="flex items-center gap-1 text-xs" title={`Racha actual (mejor: ${l.bestStreak})`}>
                        <Flame className="text-warning size-3.5" aria-hidden /> {l.streak}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TournamentStatsCard stats={tournaments} tz={me.timezone} publicView={!isMe} />
    </div>
  );
}
