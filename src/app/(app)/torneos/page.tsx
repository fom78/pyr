import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Users } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { registrationState } from "@/server/tournaments/service";
import { fileUrl } from "@/server/storage";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Torneos" };

export default async function TournamentsPage() {
  const user = await requireUser();
  const now = new Date();
  const [tournaments, entries] = await Promise.all([
    prisma.tournament.findMany({
      where: { status: { in: ["PUBLISHED", "FINISHED"] } },
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
      take: 50,
      include: { categories: { include: { category: true } }, _count: { select: { entries: true } } },
    }),
    prisma.tournamentEntry.findMany({ where: { userId: user.id }, select: { tournamentId: true } }),
  ]);
  const mine = new Set(entries.map((e) => e.tournamentId));
  const groups = [
    { title: "Mis torneos", items: tournaments.filter((t) => mine.has(t.id) && t.status === "PUBLISHED") },
    {
      title: "Inscripción abierta",
      items: tournaments.filter((t) => !mine.has(t.id) && registrationState(t, now) === "OPEN"),
    },
    {
      title: "Próximos y en curso",
      items: tournaments.filter((t) => !mine.has(t.id) && t.status === "PUBLISHED" && registrationState(t, now) !== "OPEN"),
    },
    { title: "Finalizados", items: tournaments.filter((t) => t.status === "FINISHED") },
  ].filter((g) => g.items.length);

  return (
    <>
      <PageHeader title="Torneos" description="Competencias especiales con fechas, premios y comodines. Se pagan con créditos y no usan vidas." />
      {groups.length === 0 && <EmptyState title="No hay torneos por ahora" description="Cuando se publique uno lo vas a ver acá." />}
      <div className="grid gap-8">
        {groups.map((g) => (
          <section key={g.title} className="grid gap-3">
            <h2 className="font-semibold">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((t) => {
                const img = fileUrl(t.imageKey);
                const reg = registrationState(t, now);
                return (
                  <Link key={t.id} href={`/torneos/${t.slug}`} className="overflow-hidden rounded-lg border transition-colors hover:border-primary/60">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="" className="aspect-[2/1] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[3/1] items-center justify-center bg-gradient-to-br from-primary/30 to-warning/20">
                        <Trophy className="size-10 text-warning" />
                      </div>
                    )}
                    <div className="grid gap-1 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{t.name}</span>
                        {mine.has(t.id) && <Badge>Inscripto</Badge>}
                        {t.status === "FINISHED" && <Badge variant="secondary">Finalizado</Badge>}
                        {reg === "OPEN" && !mine.has(t.id) && <Badge variant="outline">Inscripción abierta</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.categories.map((c) => `${c.category.icon ?? ""} ${c.category.name}`).join(" · ")}
                      </p>
                      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>
                          {formatDate(t.startsAt, user.timezone)} → {formatDate(t.endsAt, user.timezone)}
                        </span>
                        <span>🪙 {t.entryCost === 0 ? "gratis" : `${t.entryCost} créditos`}</span>
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
