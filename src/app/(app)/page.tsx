import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Flame, Heart, Play, Plus, Trophy } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getHomeData } from "@/server/player/queries";
import { getSettings } from "@/server/config/service";
import { EmptyState, HelpTip } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, formatNumber, fromNow } from "@/lib/format";

export default async function HomePage() {
  const user = await requireUser();
  if (!user.onboardedAt) redirect("/bienvenida");
  const [data, s] = await Promise.all([getHomeData(user.id), getSettings()]);
  const tz = user.timezone;
  const featured = data.inProgress ? null : data.pending[0];
  const activeMemberships = data.memberships.filter((m) => m.effective === "ACTIVE");
  const freeLives = s["lives.max"] - data.memberships.length;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user.name} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {data.pending.length
            ? `Tenés ${data.pending.length} ${data.pending.length === 1 ? "cuestionario" : "cuestionarios"} para jugar.`
            : "Estás al día. ¡Bien ahí!"}
        </p>
      </div>

      {data.inProgress && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-semibold">Tenés un cuestionario en curso</p>
              <p className="text-sm text-muted-foreground">{data.inProgress.quiz.title} — el reloj sigue corriendo.</p>
            </div>
            <Button asChild>
              <Link href={`/jugar/${data.inProgress.id}`}>
                <Play /> Continuar
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {featured && !user.banned && (
        <Card className="border-primary bg-gradient-to-br from-primary/15 to-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div>
              <p className="text-xs font-medium tracking-wide text-primary uppercase">Jugar ahora</p>
              <p className="text-lg font-bold">{featured.title}</p>
              <p className="text-sm text-muted-foreground">
                {featured.tournament ? `🏆 ${featured.tournament.name}` : `${featured.category?.icon} ${featured.category?.name}`} ·{" "}
                {featured._count.questions} preguntas · cierra {fromNow(featured.closesAt)}
              </p>
            </div>
            <Button asChild size="lg">
              <Link href={`/cuestionarios/${featured.id}`}>
                <Play /> Jugar
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Mis categorías{" "}
            <HelpTip>
              Tenés {s["lives.max"]} vidas: podés participar en hasta {s["lives.max"]} categorías a la vez.
            </HelpTip>
          </h2>
          <span className="flex items-center gap-0.5" aria-label={`${data.memberships.length} de ${s["lives.max"]} vidas en uso`}>
            {Array.from({ length: s["lives.max"] }, (_, i) => (
              <Heart key={i} className={i < data.memberships.length ? "size-4 fill-destructive text-destructive" : "size-4 text-muted-foreground"} />
            ))}
          </span>
        </div>
        {data.memberships.length === 0 ? (
          <EmptyState
            title="Todavía no participás en ninguna categoría"
            description={`Elegí hasta ${s["lives.max"]} para empezar a jugar.`}
            action={
              <Button asChild>
                <Link href="/categorias">Elegir categorías</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.memberships.map((m) => {
              const st = m.standing;
              const pendingHere = data.pending.filter((q) => q.categoryId === m.categoryId && !q.tournamentId).length;
              return (
                <Link key={m.id} href={`/categorias/${m.category.slug}`} className="block">
                  <Card className="h-full transition-colors hover:border-primary/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span>
                          {m.category.icon} {m.category.name}
                        </span>
                        {pendingHere > 0 && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{pendingHere} nuevo</span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {m.effective === "LEAVING" ? (
                        <p className="text-sm text-muted-foreground">En desvinculación hasta el {formatDate(m.lifeReleasesAt!, tz)}</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="flex items-center justify-center gap-0.5 text-lg font-bold tabular-nums">
                              {st ? `#${st.rank}` : "–"}
                              {st?.previousRank && st.previousRank > st.rank && <ArrowUp className="size-3.5 text-success" />}
                              {st?.previousRank && st.previousRank < st.rank && <ArrowDown className="size-3.5 text-destructive" />}
                            </p>
                            <p className="text-xs text-muted-foreground">posición</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold tabular-nums">{st ? formatNumber(st.points) : 0}</p>
                            <p className="text-xs text-muted-foreground">puntos</p>
                            {m.pendingPoints > 0 && (
                              <p className="text-[11px] font-medium text-primary" title="Entran a la tabla cuando cierre el cuestionario">
                                +{formatNumber(m.pendingPoints)} pend.
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="flex items-center justify-center gap-0.5 text-lg font-bold tabular-nums">
                              <Flame className="size-4 text-warning" />
                              {m.streak?.current ?? 0}
                            </p>
                            <p className="text-xs text-muted-foreground">racha</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
            {freeLives > 0 && (
              <Link href="/categorias" className="block">
                <Card className="flex h-full items-center justify-center border-dashed text-muted-foreground hover:text-foreground">
                  <CardContent className="flex items-center gap-2 py-6">
                    <Plus className="size-4" /> Sumar categoría ({freeLives} {freeLives === 1 ? "vida libre" : "vidas libres"})
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        )}
      </section>

      {(data.pending.length > 1 || data.upcoming.length > 0) && (
        <section className="grid gap-2">
          <h2 className="font-semibold">Novedades</h2>
          <ul className="grid gap-2 text-sm">
            {data.pending.slice(featured ? 1 : 0).map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span>
                  <strong>{q.title}</strong> está vigente · cierra {fromNow(q.closesAt)}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/cuestionarios/${q.id}`}>Jugar</Link>
                </Button>
              </li>
            ))}
            {data.upcoming.slice(0, 4).map((q) => (
              <li key={q.id} className="rounded-lg border p-3 text-muted-foreground">
                Próximamente: <strong className="text-foreground">{q.title}</strong> abre {fromNow(q.opensAt)} ({formatDateTime(q.opensAt, tz)})
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.openTournaments.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-semibold">Torneos con inscripción abierta</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.openTournaments.map((t) => (
              <Link key={t.id} href={`/torneos/${t.slug}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50">
                <Trophy className="size-6 text-warning" />
                <div className="text-sm">
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-muted-foreground">
                    {t.entryCost} créditos · inscripción hasta el {formatDate(t.registrationEndsAt, tz)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {activeMemberships.length > 0 && data.pending.length === 0 && !data.inProgress && (
        <p className="text-center text-sm text-muted-foreground">No hay cuestionarios pendientes. Te avisamos acá cuando salga el próximo.</p>
      )}
    </div>
  );
}
