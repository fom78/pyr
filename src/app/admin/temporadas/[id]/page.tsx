import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { fileUrl } from "@/server/storage";
import { getSeasonEditor, launchDueAt, nextDay0, rulePlan, stagePlan } from "@/server/seasons/service";
import { addDays, localDay } from "@/server/seasons/plan";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_TZ, formatDate, formatDateTime } from "@/lib/format";
import { TOURNAMENT_STATUS } from "../../torneos/labels";
import { RUN_STATUS, SEASON_STATUS } from "../labels";
import { SeasonForm } from "../season-form";
import { SeasonPlanner } from "./season-planner";
import { CancelRunButton, SeasonActions } from "./season-actions";

export const metadata = { title: "Temporada" };

export default async function AdminSeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("tournament.manage");
  const { id } = await params;
  const data = await getSeasonEditor(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const { season, runs } = data;
  const now = new Date();
  const tz = user.timezone;
  const plans = season.stages.map(stagePlan);
  const last = runs[0];
  // Sugerencia de día 0: el de la próxima repetición o, si no hay, en una semana.
  const next = last && season.repeatAfterDays != null && last.status !== "CANCELLED" ? nextDay0(last, season.repeatAfterDays) : null;
  const defaultDay0 = next ?? addDays(localDay(now), 7);
  const autoAt = next && plans.length && !last.nextCreatedAt ? launchDueAt(plans, next) : null;
  const stageName = new Map(season.stages.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/temporadas", label: "Temporadas" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {season.name} <Badge variant="secondary">{SEASON_STATUS[season.status]}</Badge>
          </span>
        }
        description={
          runs.length ? (
            <Link className="underline" href={`/temporadas/${season.slug}`}>
              Ver como jugador
            </Link>
          ) : (
            "Sin lanzar: los jugadores todavía no la ven."
          )
        }
        actions={<SeasonActions seasonId={season.id} repeats={season.repeatAfterDays != null} archived={season.status === "ARCHIVED"} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <SeasonPlanner
          seasonId={season.id}
          stages={plans}
          rules={season.rules.map(rulePlan)}
          defaultDay0={defaultDay0}
          now={now.toISOString()}
          archived={season.status === "ARCHIVED"}
        />
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos</CardTitle>
            </CardHeader>
            <CardContent>
              <SeasonForm
                id={season.id}
                initial={{
                  name: season.name,
                  description: season.description ?? "",
                  imageKey: season.imageKey,
                  imageUrl: fileUrl(season.imageKey),
                  repeatAfterDays: season.repeatAfterDays,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Instancias</CardTitle>
              {autoAt && season.status === "ACTIVE" && (
                <p className="text-muted-foreground text-xs">
                  La #{last.number + 1} (día 0: {formatDate(`${next}T12:00:00Z`, DEFAULT_TZ, "d/M/yyyy")}) se lanza sola el {formatDateTime(autoAt, tz)}.
                </p>
              )}
            </CardHeader>
            <CardContent className="grid gap-4">
              {runs.length === 0 && <p className="text-muted-foreground text-sm">Todavía no se lanzó.</p>}
              {runs.map((r) => (
                <div key={r.id} className="grid gap-1.5 border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      #{r.number} <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>{RUN_STATUS[r.status]}</Badge>
                    </span>
                    {r.status === "ACTIVE" && <CancelRunButton seasonId={season.id} runId={r.id} number={r.number} />}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(r.startsAt, tz)} → {formatDate(r.endsAt, tz)}
                  </p>
                  <ul className="grid gap-1 text-sm">
                    {r.tournaments.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                        <Link className="truncate underline-offset-2 hover:underline" href={`/admin/torneos/${t.id}`}>
                          {t.format === "KNOCKOUT" ? "⚔️ " : ""}
                          {(t.seasonStageId && stageName.get(t.seasonStageId)) || t.name}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {formatDate(t.startsAt, tz, "d/M")} · {TOURNAMENT_STATUS[t.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
