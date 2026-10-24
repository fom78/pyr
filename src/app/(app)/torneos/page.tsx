import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Users } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isQualifiersOnly, registrationState } from "@/server/tournaments/service";
import { fileUrl } from "@/server/storage";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Torneos" };

export default async function TournamentsPage() {
  const user = await requireUser();
  const now = new Date();
  const [tournaments, entries, seasons] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["PUBLISHED", "FINISHED"] } },
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
      take: 50,
      include: {
        categories: { include: { category: true } },
        _count: { select: { entries: true } },
        qualifiers: { select: { fromRank: true, topN: true } },
        seasonRun: { select: { number: true, season: { select: { name: true } } } },
      },
    }),
    prisma.tournamentEntry.findMany({ where: { userId: user.id }, select: { tournamentId: true } }),
    prisma.seasonRun.findMany({
      where: { status: "ACTIVE", season: { status: { not: "ARCHIVED" } } },
      orderBy: { startsAt: "asc" },
      select: { id: true, number: true, startsAt: true, endsAt: true, season: { select: { name: true, slug: true } } },
    }),
  ]);
  const mine = new Set(entries.map((e) => e.tournamentId));
  // Una eliminatoria solo por clasificación no tiene inscripción abierta para el público.
  const openToAll = (t: (typeof tournaments)[number]) => registrationState(t, now) === "OPEN" && !isQualifiersOnly(t);
  const groups = [
    { title: "Mis torneos", items: tournaments.filter((t) => mine.has(t.id) && t.status === "PUBLISHED") },
    {
      title: "Inscripción abierta",
      items: tournaments.filter((t) => !mine.has(t.id) && openToAll(t)),
    },
    {
      title: "Próximos y en curso",
      items: tournaments.filter((t) => !mine.has(t.id) && t.status === "PUBLISHED" && !openToAll(t)),
    },
    { title: "Finalizados", items: tournaments.filter((t) => t.status === "FINISHED") },
  ].filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        title="Torneos"
        description="Competencias especiales con fechas, premios y comodines. Se pagan con créditos y no usan vidas."
      />
      {groups.length === 0 && seasons.length === 0 && (
        <EmptyState title="No hay torneos por ahora" description="Cuando se publique uno lo vas a ver acá." />
      )}
      <div className="grid gap-8">
        {seasons.length > 0 && (
          <section className="grid gap-3">
            <h2 className="font-semibold">Temporadas en curso</h2>
            <div className="flex flex-wrap gap-2">
              {seasons.map((r) => (
                <Link
                  key={r.id}
                  href={`/temporadas/${r.season.slug}?n=${r.number}`}
                  className="hover:border-primary/60 rounded-lg border px-3 py-2 text-sm"
                >
                  📅{" "}
                  <span className="font-medium">
                    {r.season.name} #{r.number}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {formatDate(r.startsAt, user.timezone, "d/M")} → {formatDate(r.endsAt, user.timezone, "d/M")}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {groups.map((g) => (
          <section key={g.title} className="grid gap-3">
            <h2 className="font-semibold">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((t) => {
                const img = fileUrl(t.imageKey);
                const qualifiersOnly = isQualifiersOnly(t);
                return (
                  <Link
                    key={t.id}
                    href={`/torneos/${t.slug}`}
                    className="hover:border-primary/60 overflow-hidden rounded-lg border transition-colors"
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
                        {mine.has(t.id) && <Badge>Inscripto</Badge>}
                        {t.status === "FINISHED" && <Badge variant="secondary">Finalizado</Badge>}
                        {!mine.has(t.id) && t.status === "PUBLISHED" && qualifiersOnly && (
                          <Badge variant="outline">Por clasificación</Badge>
                        )}
                        {!mine.has(t.id) && openToAll(t) && <Badge variant="outline">Inscripción abierta</Badge>}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {t.categories.map((c) => `${c.category.icon ?? ""} ${c.category.name}`).join(" · ")}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                        <span>
                          {formatDate(t.startsAt, user.timezone)} → {formatDate(t.endsAt, user.timezone)}
                        </span>
                        {!qualifiersOnly && <span>🪙 {t.entryCost === 0 ? "gratis" : `${t.entryCost} créditos`}</span>}
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" /> {t._count.entries}
                          {t.maxParticipants ? `/${t.maxParticipants}` : ""}
                        </span>
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
