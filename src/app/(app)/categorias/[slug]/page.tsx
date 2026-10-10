import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, CheckCircle2, ListOrdered } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getCategoryPageData } from "@/server/player/queries";
import { getLivesSummary } from "@/server/league/service";
import { EmptyState, HelpTip, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuizCard } from "@/components/game/quiz-card";
import { StandingsTable } from "@/components/game/standings-table";
import { MemberStats } from "@/components/game/category-card";
import { JoinButton, LeaveButton } from "@/components/game/membership-buttons";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.charAt(0).toUpperCase() + slug.slice(1) };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  // Links viejos a la pestaña de la tabla
  if ((await searchParams).tab === "tabla") redirect(`/categorias/${slug}/tabla`);
  const data = await getCategoryPageData(slug, user.id);
  if (!data) notFound();
  const { category, membership, active, upcoming, history, top, myStanding, settings: s, streak } = data;
  const lives = await getLivesSummary(user.id);
  const isMember = membership?.effective === "ACTIVE";
  const canPlay = isMember && !user.banned;
  const tz = user.timezone;
  const bestK = s["ranking.bestK"];
  const bestKHelp = (
    <>
      Se suman tus {bestK} mejores puntajes entre los cuestionarios vigentes y los cerrados de los últimos {s["ranking.windowDays"]} días que
      todavía son computables. La tabla se actualiza apenas terminás un cuestionario.
    </>
  );
  const toCard = (q: (typeof active)[number]) => ({ ...q, questionCount: q._count.questions });

  return (
    <>
      <PageHeader
        back={{ href: "/categorias", label: "Liga" }}
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden>{category.icon}</span> {category.name}
          </span>
        }
        description={category.description}
        actions={
          isMember ? (
            <LeaveButton
              categoryId={category.id}
              categoryName={category.name}
              cooldownDays={s["league.leaveCooldownDays"]}
              release={formatDate(data.leavePreview.lifeReleasesAt, tz)}
              rejoin={formatDate(data.leavePreview.rejoinAllowedAt, tz)}
            />
          ) : membership?.effective === "LEAVING" ? (
            <span className="text-sm text-muted-foreground">En desvinculación hasta el {formatDate(membership.lifeReleasesAt!, tz)}</span>
          ) : (
            !user.banned &&
            category.active && (
              <JoinButton
                categoryId={category.id}
                categoryName={category.name}
                livesFree={lives.free}
                livesMax={lives.max}
                cooldownDays={s["league.leaveCooldownDays"]}
              />
            )
          )
        }
      />

      <div className="grid gap-8">
        {isMember ? (
          <Card>
            <CardContent className="grid gap-2 py-4">
              <MemberStats standing={myStanding} streak={streak?.current ?? 0} />
              <p className="text-center text-xs text-muted-foreground">
                {myStanding ? (
                  <>
                    Sumando {myStanding.quizzesCounted} de tus {bestK} mejores <HelpTip label="Cómo se calculan los puntos">{bestKHelp}</HelpTip>
                  </>
                ) : (
                  <>Jugá un cuestionario y entrás en la tabla al instante.</>
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Para jugar los cuestionarios de esta categoría tenés que participar en ella (usa una de tus {lives.max} vidas).
          </p>
        )}

        <section className="grid gap-2">
          <h2 className="font-semibold">Cuestionario vigente</h2>
          {active.length > 0 ? (
            active.map((q) => (
              <QuizCard
                key={q.id}
                q={{ ...toCard(q), subtitle: q.participants > 0 && <p className="text-xs text-muted-foreground">{q.participants} ya lo jugaron</p> }}
                canPlay={canPlay}
                tz={tz}
              />
            ))
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden />
              {upcoming[0] ? <>No hay uno vigente ahora. El próximo abre el {formatDateTime(upcoming[0].opensAt, tz)}.</> : <>No hay uno vigente ahora.</>}
            </p>
          )}
        </section>

        <section className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Tabla <HelpTip>{bestKHelp}</HelpTip>
            </h2>
            {data.rankedCount > top.length && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/categorias/${category.slug}/tabla`}>
                  <ListOrdered /> Ver tabla completa ({data.rankedCount})
                </Link>
              </Button>
            )}
          </div>
          {top.length === 0 ? (
            <EmptyState title="La tabla todavía está vacía" description="Se llena apenas alguien termina un cuestionario." />
          ) : (
            <StandingsTable rows={top} meId={user.id} me={myStanding} countedLabel={`Mejores ${bestK}`} countedHelp={bestKHelp} />
          )}
        </section>

        {upcoming.length > 0 && (
          <section className="grid gap-2">
            <h2 className="font-semibold">Próximos</h2>
            {upcoming.map((q) => (
              <QuizCard key={q.id} q={toCard(q)} canPlay={canPlay} tz={tz} />
            ))}
          </section>
        )}

        <section className="grid gap-2">
          <h2 className="font-semibold">
            Historial{" "}
            <HelpTip>
              “Suma”: todavía cuenta para la tabla (hasta {s["quiz.computableDays"]} días después de cerrar). “Ya no suma”: quedó como historial.
            </HelpTip>
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no cerró ningún cuestionario.</p>
          ) : (
            <ul className="grid gap-2">
              {history.map((q) => {
                const played = q.attempt && q.attempt.status !== "IN_PROGRESS";
                const row = (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/40">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {q.title}
                        <Badge variant={q.derived === "CLOSED" ? "default" : "outline"} className="text-[10px]">
                          {q.derived === "CLOSED" ? "suma" : "ya no suma"}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Cerró el {formatDate(q.closesAt, tz)} · {q.participants} {q.participants === 1 ? "jugador" : "jugadores"}
                        {q.bestScore !== null && <> · mejor: {formatNumber(q.bestScore)} pts</>}
                      </span>
                    </div>
                    {played ? (
                      <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                        <CheckCircle2 className="size-4 text-success" aria-hidden />
                        {formatNumber(q.attempt!.score)} pts
                        {q.position && (
                          <span className="font-normal text-muted-foreground">
                            · #{q.position} de {q.participants}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No jugaste</span>
                    )}
                  </div>
                );
                return (
                  <li key={q.id}>
                    {played ? (
                      <Link href={`/resultados/${q.attempt!.id}`} className="block">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {data.hasMoreHistory && (
            <Link href="/historial" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Ver todo mi historial
            </Link>
          )}
        </section>

        <section className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          <h2 className="font-semibold text-foreground">Sobre esta categoría</h2>
          <p>
            {data.participants} {data.participants === 1 ? "participante" : "participantes"} · un cuestionario cada {s["quiz.frequencyDays"]}{" "}
            {s["quiz.frequencyDays"] === 1 ? "día" : "días"} · en la tabla suman tus {bestK} mejores de los últimos {s["ranking.windowDays"]} días.
          </p>
        </section>
      </div>
    </>
  );
}
