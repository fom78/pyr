import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { listSeasons } from "@/server/seasons/service";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { SeasonForm } from "./season-form";
import { SEASON_STATUS } from "./labels";

export const metadata = { title: "Temporadas" };

export default async function AdminSeasonsPage() {
  const user = await requirePermission("tournament.manage");
  const seasons = await listSeasons();
  return (
    <>
      <PageHeader
        title="Temporadas"
        description="Plantillas de torneos con fechas relativas y eliminatorias alimentadas por puestos. Cada lanzamiento crea todos los torneos de una instancia, ya publicados."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {seasons.length === 0 ? (
          <EmptyState title="Todavía no hay temporadas" description="Creá una, agregale sus torneos y las reglas de clasificación, y lanzala." />
        ) : (
          <ul className="grid content-start gap-2">
            {seasons.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/temporadas/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-accent/50">
                  <div className="grid gap-0.5">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {s._count.stages} torneos ·{" "}
                      {s.lastRun
                        ? `última: #${s.lastRun.number} (${formatDate(s.lastRun.startsAt, user.timezone)} → ${formatDate(s.lastRun.endsAt, user.timezone)})`
                        : "sin lanzar"}{" "}
                      · {s.repeatAfterDays != null ? `se repite ${s.repeatAfterDays} días después del fin` : "no se repite"}
                    </span>
                  </div>
                  <Badge variant={s.status === "ACTIVE" ? "default" : "secondary"}>{SEASON_STATUS[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Card className="content-start">
          <CardHeader>
            <CardTitle className="text-base">Nueva temporada</CardTitle>
            <CardDescription>Después le agregás los torneos y las reglas.</CardDescription>
          </CardHeader>
          <CardContent>
            <SeasonForm id={null} initial={{ name: "", description: "", imageKey: null, imageUrl: null, repeatAfterDays: null }} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
