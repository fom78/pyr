import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Swords, Trophy } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { fileUrl } from "@/server/storage";
import { getPublicSeason } from "@/server/seasons/service";
import { isQualifiersOnly, registrationState } from "@/server/tournaments/service";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await prisma.season.findUnique({ where: { slug }, select: { name: true } });
  return { title: s?.name ?? "Temporada" };
}

const RUN_LABEL = { ACTIVE: "En curso", FINISHED: "Terminada", CANCELLED: "Cancelada" } as const;

/** Calendario de una instancia de temporada y cómo se clasifica a sus eliminatorias. */
export default async function SeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const { n } = await searchParams;
  const data = await getPublicSeason(slug, n ? Number(n) : undefined);
  if (!data) notFound();
  const { season, run, tournaments } = data;
  const tz = user.timezone;
  const now = new Date();
  const mine = new Set(
    (
      await prisma.tournamentEntry.findMany({
        where: { userId: user.id, tournamentId: { in: tournaments.map((t) => t.id) } },
        select: { tournamentId: true },
      })
    ).map((e) => e.tournamentId),
  );
  const stageName = (id: string) => season.stages.find((s) => s.id === id)?.name ?? "?";
  const label = (t: { seasonStageId: string | null; name: string }) => (t.seasonStageId && stageName(t.seasonStageId)) || t.name;
  const byId = new Map(tournaments.map((t) => [t.id, t]));
  const range = (q: { fromRank: number; topN: number }) => (q.fromRank > 1 ? `${q.fromRank}°–${q.topN}°` : `top ${q.topN}`);
  // Reglas reales de la instancia: qué recibe cada eliminatoria y a dónde manda cada torneo.
  const feedsFrom = (t: (typeof tournaments)[number]) =>
    t.qualifiers
      .filter((q) => byId.has(q.sourceTournamentId))
      .map((q) => `${range(q)} de ${label(byId.get(q.sourceTournamentId)!)}`);
  const feedsTo = (t: (typeof tournaments)[number]) =>
    tournaments
      .flatMap((k) => k.qualifiers.filter((q) => q.sourceTournamentId === t.id).map((q) => ({ q, k })))
      .sort((a, b) => a.q.fromRank - b.q.fromRank)
      .map(({ q, k }) => `${range(q)} → ${label(k)}`);
  const hasRules = tournaments.some((t) => t.qualifiers.length > 0);
  const img = fileUrl(season.imageKey);
  const status = (t: (typeof tournaments)[number]) => {
    if (t.status === "FINISHED") return <Badge variant="secondary">Finalizado</Badge>;
    if (t.status === "CANCELLED") return <Badge variant="secondary">Cancelado</Badge>;
    if (isQualifiersOnly(t) && t.startsAt > now) return <Badge variant="outline">Por clasificación</Badge>;
    if (registrationState(t, now) === "OPEN") return <Badge variant="outline">Inscripción abierta</Badge>;
    if (t.startsAt <= now) return <Badge>En juego</Badge>;
    return <Badge variant="secondary">Próximo</Badge>;
  };

  return (
    <>
      <PageHeader
        back={{ href: "/torneos", label: "Torneos" }}
        title={`${season.name} #${run.number}`}
        description={`${formatDate(run.startsAt, tz)} → ${formatDate(run.endsAt, tz)} · ${RUN_LABEL[run.status]}`}
      />
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="mb-6 aspect-[3/1] w-full rounded-lg object-cover" />
      )}
      {season.description && <p className="text-muted-foreground mb-6 text-pretty">{season.description}</p>}
      <div className={cn("grid gap-6", season.runs.length > 1 && "lg:grid-cols-[1fr_340px]")}>
        <section className="grid content-start gap-3">
          <h2 className="font-semibold">Calendario</h2>
          <ol className="grid gap-2">
            {tournaments.map((t) => {
              const from = feedsFrom(t);
              const to = feedsTo(t);
              return (
                <li key={t.id}>
                  <Link
                    href={`/torneos/${t.slug}`}
                    className="hover:border-primary/60 flex flex-wrap items-center gap-3 rounded-lg border p-3"
                  >
                    {t.format === "KNOCKOUT" ? (
                      <Swords className="size-5 text-amber-500" aria-hidden />
                    ) : (
                      <Trophy className="text-primary size-5" aria-hidden />
                    )}
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {label(t)} {status(t)}
                        {mine.has(t.id) && <Badge>Inscripto</Badge>}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(t.startsAt, tz)} → {formatDateTime(t.endsAt, tz)} · {t._count.entries} inscriptos
                        {t.format !== "KNOCKOUT" && ` · ${t.entryCost === 0 ? "gratis" : `${t.entryCost} créditos`}`}
                      </span>
                      {from.length > 0 && <span className="text-xs">Clasifican: {from.join(" · ")}</span>}
                      {to.length > 0 && <span className="text-xs">Clasifica: {to.join(" · ")}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
          {hasRules && (
            <p className="text-muted-foreground text-xs">
              Los clasificados entran gratis cuando termina su torneo. Si clasificás a dos eliminatorias, vas a la de mejor nivel
              y tu lugar en la otra pasa al siguiente de la tabla.
            </p>
          )}
        </section>
        <div className="grid content-start gap-6">
          {season.runs.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Otras instancias</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-sm">
                  {season.runs
                    .filter((r) => r.id !== run.id)
                    .map((r) => (
                      <li key={r.id}>
                        <Link className="underline-offset-2 hover:underline" href={`/temporadas/${season.slug}?n=${r.number}`}>
                          #{r.number}
                        </Link>{" "}
                        <span className="text-muted-foreground">
                          {formatDate(r.startsAt, tz)} → {formatDate(r.endsAt, tz)} · {RUN_LABEL[r.status]}
                        </span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
