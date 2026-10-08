import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { TOURNAMENT_STATUS } from "./labels";

export const metadata = { title: "Torneos" };


export default async function AdminTournamentsPage() {
  const user = await requirePermission("tournament.manage");
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startsAt: "desc" },
    take: 100,
    include: { _count: { select: { entries: true, quizzes: true } } },
  });
  return (
    <>
      <PageHeader
        title="Torneos"
        actions={
          <Button asChild>
            <Link href="/admin/torneos/nuevo">
              <Plus /> Nuevo torneo
            </Link>
          </Button>
        }
      />
      {tournaments.length === 0 ? (
        <EmptyState title="No hay torneos" />
      ) : (
        <ul className="grid gap-2">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/torneos/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-accent/50">
                <div className="grid gap-0.5">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(t.startsAt, user.timezone)} → {formatDate(t.endsAt, user.timezone)} · {t._count.entries} inscriptos ·{" "}
                    {t._count.quizzes}/{t.quizCount} cuestionarios · {t.entryCost} créditos
                  </span>
                </div>
                <Badge variant={t.status === "PUBLISHED" ? "default" : "secondary"}>{TOURNAMENT_STATUS[t.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
