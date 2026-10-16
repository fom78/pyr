import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { listTournamentResults } from "@/server/player/tournament-stats";
import { percentile } from "@/server/player/tournament-summary";
import { EmptyState, PageHeader, Pager, parsePage } from "@/components/common";
import { PrizeBadge, rankLabel } from "@/components/game/tournament-stats-card";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Mis torneos" };

const PAGE_SIZE = 20;

export default async function MyTournamentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const { total, rows } = await listTournamentResults(user.id, page, PAGE_SIZE);
  return (
    <>
      <PageHeader back={{ href: "/perfil", label: "Perfil" }} title="Mis torneos" description="Tu puesto final en cada torneo que terminó." />
      {rows.length === 0 ? (
        <EmptyState title="Todavía no terminaste ningún torneo" />
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.tournamentId}>
              <Link
                href={`/torneos/${r.tournament.slug}`}
                className="hover:bg-accent/40 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm"
              >
                <span className="w-16 text-base font-semibold tabular-nums">{rankLabel(r.rank)}</span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{r.tournamentName}</span>
                  <span className="text-muted-foreground text-xs">
                    de {r.participants} · mejor que el {percentile(r.rank, r.participants)}% · terminó el {formatDate(r.finishedAt, user.timezone)}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {formatNumber(r.points)} pts
                  <span className="text-muted-foreground block text-xs">
                    {r.quizzesPlayed}/{r.quizzesTotal} jugados · {r.correctCount} aciertos
                  </span>
                </span>
                <PrizeBadge credits={r.prizeCredits} stars={r.prizeStars} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} searchParams={sp} basePath="/perfil/torneos" />
    </>
  );
}
