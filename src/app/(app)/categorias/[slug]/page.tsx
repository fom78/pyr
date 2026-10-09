import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flame } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getCategoryPageData } from "@/server/player/queries";
import { getLivesSummary } from "@/server/league/service";
import { EmptyState, HelpTip, PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuizCard } from "@/components/game/quiz-card";
import { StandingsTable } from "@/components/game/standings-table";
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
  const { tab } = await searchParams;
  const data = await getCategoryPageData(slug, user.id);
  if (!data) notFound();
  const { category, membership, quizzes, standings, myStanding, settings: s, streak } = data;
  const lives = await getLivesSummary(user.id);
  const isMember = membership?.effective === "ACTIVE";
  const canPlay = isMember && !user.banned;
  const tz = user.timezone;
  const bestKHelp = (
    <>
      Se suman tus {s["ranking.bestK"]} mejores puntajes entre los cuestionarios cerrados de los últimos {s["ranking.windowDays"]} días que
      todavía son computables.
    </>
  );

  const active = quizzes.filter((q) => q.derived === "ACTIVE");
  const upcoming = quizzes.filter((q) => q.derived === "SCHEDULED");
  const history = quizzes.filter((q) => q.derived === "CLOSED" || q.derived === "EXPIRED");
  const toCard = (q: (typeof quizzes)[number]) => ({ ...q, questionCount: q._count.questions });
  // Jugados pero todavía vigentes: sus puntos entran a la tabla cuando el cuestionario cierre.
  const pending = active.filter((q) => q.attempt && q.attempt.status !== "IN_PROGRESS");
  const pendingPoints = pending.reduce((a, q) => a + (q.attempt?.score ?? 0), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/categorias", label: "Categorías" }}
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
            <span className="text-sm text-muted-foreground">
              En desvinculación hasta el {formatDate(membership.lifeReleasesAt!, tz)}
            </span>
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

      {isMember && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{myStanding ? `#${myStanding.rank}` : "–"}</p>
              <p className="text-xs text-muted-foreground">Posición</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{myStanding ? formatNumber(myStanding.points) : "0"}</p>
              {pendingPoints > 0 && <p className="text-xs font-medium text-primary">+{formatNumber(pendingPoints)} pendientes</p>}
              <p className="text-xs text-muted-foreground">
                Puntos <HelpTip label="Cómo se calculan los puntos">{bestKHelp}</HelpTip>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="flex items-center justify-center gap-1 text-2xl font-bold tabular-nums">
                <Flame className="size-5 text-warning" aria-hidden /> {streak?.current ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                Racha <HelpTip>Cuestionarios seguidos de esta categoría sin saltear ninguno. Cada {s["credits.streakLength"]} ganás créditos extra.</HelpTip>
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {!isMember && (
        <p className="mb-6 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Para jugar los cuestionarios de esta categoría tenés que participar en ella (usa una de tus {lives.max} vidas).
        </p>
      )}

      <Tabs defaultValue={tab === "tabla" ? "tabla" : "cuestionarios"}>
        <TabsList className="mb-4">
          <TabsTrigger value="cuestionarios">Cuestionarios</TabsTrigger>
          <TabsTrigger value="tabla">Tabla</TabsTrigger>
        </TabsList>
        <TabsContent value="cuestionarios" className="grid gap-6">
          {quizzes.length === 0 && <EmptyState title="Todavía no hay cuestionarios publicados" />}
          {active.length > 0 && (
            <section className="grid gap-2">
              <h2 className="font-semibold">Vigentes</h2>
              {active.map((q) => (
                <QuizCard key={q.id} q={toCard(q)} canPlay={canPlay} tz={tz} />
              ))}
            </section>
          )}
          {upcoming.length > 0 && (
            <section className="grid gap-2">
              <h2 className="font-semibold">Próximos</h2>
              {upcoming.map((q) => (
                <QuizCard key={q.id} q={toCard(q)} canPlay={canPlay} tz={tz} />
              ))}
            </section>
          )}
          {history.length > 0 && (
            <section className="grid gap-2">
              <h2 className="font-semibold">
                Historial{" "}
                <HelpTip>
                  “Cerrado” = computable: suma para la tabla durante {s["quiz.computableDays"]} días. “Historial” = ya no suma.
                </HelpTip>
              </h2>
              {history.map((q) => (
                <QuizCard key={q.id} q={toCard(q)} canPlay={false} tz={tz} />
              ))}
            </section>
          )}
        </TabsContent>
        <TabsContent value="tabla" className="grid gap-4">
          {pending.length > 0 && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <p className="mb-1 font-medium">
                Tus puntos pendientes{" "}
                <HelpTip>
                  La tabla solo cuenta cuestionarios cerrados, para que nadie saque ventaja por jugar antes. Cuando cierre, el puntaje entra si está
                  entre tus {s["ranking.bestK"]} mejores.
                </HelpTip>
              </p>
              <ul className="grid gap-0.5">
                {pending.map((q) => (
                  <li key={q.id}>
                    {q.title}: <strong className="tabular-nums">{formatNumber(q.attempt!.score)} pts</strong>{" "}
                    <span className="text-muted-foreground">· entran cuando cierre, el {formatDateTime(q.closesAt, tz)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {standings.length === 0 ? (
            <EmptyState
              title="La tabla todavía está vacía"
              description="Se arma cuando cierra el primer cuestionario: la tabla solo cuenta cuestionarios cerrados."
            />
          ) : (
            <StandingsTable
              rows={standings}
              meId={user.id}
              me={myStanding}
              countedLabel={`Mejores ${s["ranking.bestK"]}`}
              countedHelp={bestKHelp}
            />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
