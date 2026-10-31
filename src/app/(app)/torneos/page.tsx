import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getTournamentsHub, type TournamentCardData } from "@/server/tournaments/hub";
import { defaultTab } from "@/server/tournaments/listing";
import { fileUrl } from "@/server/storage";
import { EmptyState, PageHeader } from "@/components/common";
import { TournamentCard } from "@/components/game/tournament-card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Torneos" };

const TABS = ["mios", "curso", "proximos", "finalizados", "temporadas"] as const;
type Tab = (typeof TABS)[number];

type Search = { tab?: string; todos?: string; page?: string; solo?: string };

function href(q: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") params.set(k, String(v));
  const s = params.toString();
  return s ? `/torneos?${s}` : "/torneos";
}

function Section({ title, children, empty }: { title?: string; children: React.ReactNode; empty?: boolean }) {
  if (empty) return null;
  return (
    <section className="grid gap-3">
      {title && <h2 className="font-semibold">{title}</h2>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function MoreLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link href={to} className="text-primary text-sm underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

/** Torneos en pestañas: mis torneos, en curso, próximos, finalizados y temporadas. Cada pestaña es una URL. */
export default async function TournamentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const tz = user.timezone;
  const onlyMine = sp.solo === "mios";
  const {
    groups: g,
    mine,
    finished,
    ranks,
    seasons,
  } = await getTournamentsHub(user.id, {
    now,
    finishedPage: Number(sp.page) || 1,
    onlyMine,
  });
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : defaultTab(g);
  const all = sp.todos === "1";
  const card = (t: TournamentCardData, dim?: boolean) => (
    <TournamentCard key={t.id} t={t} now={now} tz={tz} mine={mine.has(t.id)} rank={ranks.get(t.id)} dim={dim} />
  );
  const open = all ? g.upcoming.all.open : g.upcoming.open;
  const later = all ? g.upcoming.all.later : g.upcoming.later;
  const pageHref = (page: number) => href({ tab: "finalizados", solo: onlyMine ? "mios" : undefined, page });

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "mios", label: "Mis torneos", count: g.mine.length },
    { id: "curso", label: "En curso", count: g.active.total },
    { id: "proximos", label: "Próximos", count: g.upcoming.total },
    { id: "finalizados", label: "Finalizados" },
    { id: "temporadas", label: "Temporadas", count: seasons.length },
  ];

  return (
    <>
      <PageHeader
        title="Torneos"
        description="Competencias especiales con fechas, premios y comodines. Se pagan con créditos y no usan vidas."
      />
      <nav aria-label="Secciones de torneos" className="-mx-4 mb-6 overflow-x-auto px-4">
        <div className="bg-muted text-muted-foreground inline-flex min-w-max items-center rounded-lg p-[3px]">
          {tabs.map((x) => (
            <Link
              key={x.id}
              href={href({ tab: x.id })}
              aria-current={tab === x.id ? "page" : undefined}
              className={cn(
                "hover:text-foreground inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                tab === x.id && "bg-background text-foreground shadow-sm",
              )}
            >
              {x.label}
              {x.count ? (
                <span className="bg-primary/15 text-primary rounded-full px-1.5 text-xs tabular-nums">{x.count}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </nav>

      {tab === "mios" &&
        (g.mine.length === 0 ? (
          <EmptyState
            title="Todavía no estás en ningún torneo"
            description="Mirá los que están por empezar y anotate."
            action={
              <Button asChild>
                <Link href={href({ tab: "proximos" })}>Ver próximos</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-8">
            <Section title="Jugando" empty={!g.active.mine.length}>
              {g.active.mine.map((t) => card(t))}
            </Section>
            <Section title="Por empezar" empty={!g.upcoming.mine.length}>
              {g.upcoming.mine.map((t) => card(t))}
            </Section>
          </div>
        ))}

      {tab === "curso" && (
        <div className="grid gap-8">
          {g.active.total === 0 ? (
            <EmptyState title="No hay torneos en curso" description="Mirá los próximos para anotarte." />
          ) : (
            !all &&
            !g.active.mine.length &&
            !g.active.joinable.length && (
              <EmptyState
                title="No hay torneos en curso a los que te puedas sumar"
                description="Los que se están jugando ya cerraron la inscripción. Mirá los próximos para anotarte."
                action={
                  <Button asChild>
                    <Link href={href({ tab: "proximos" })}>Ver próximos</Link>
                  </Button>
                }
              />
            )
          )}
          <Section title="Jugando" empty={!g.active.mine.length}>
            {g.active.mine.map((t) => card(t))}
          </Section>
          <Section title="Todavía podés sumarte" empty={!(all ? g.active.all.joinable : g.active.joinable).length}>
            {(all ? g.active.all.joinable : g.active.joinable).map((t) => card(t))}
          </Section>
          {all && (
            <Section title="Ya empezados" empty={!g.active.all.started.length}>
              {g.active.all.started.map((t) => card(t, true))}
            </Section>
          )}
          {!all && g.active.hidden > 0 && (
            <MoreLink to={href({ tab: "curso", todos: 1 })}>Ver todos los torneos en curso ({g.active.hidden} más)</MoreLink>
          )}
        </div>
      )}

      {tab === "proximos" && (
        <div className="grid gap-8">
          {g.upcoming.total === 0 && (
            <EmptyState title="No hay torneos programados" description="Cuando se publique uno lo vas a ver acá." />
          )}
          <Section title="Ya estás anotado" empty={!g.upcoming.mine.length}>
            {g.upcoming.mine.map((t) => card(t))}
          </Section>
          <Section title="Inscripción abierta" empty={!open.length}>
            {open.map((t) => card(t))}
          </Section>
          <Section title="Más adelante" empty={!later.length}>
            {later.map((t) => card(t))}
          </Section>
          {!all && g.upcoming.hidden > 0 && (
            <MoreLink to={href({ tab: "proximos", todos: 1 })}>Ver todos los próximos ({g.upcoming.hidden} más)</MoreLink>
          )}
        </div>
      )}

      {tab === "finalizados" && (
        <div className="grid gap-4">
          <div className="flex gap-2">
            <Button asChild size="sm" variant={onlyMine ? "ghost" : "secondary"}>
              <Link href={href({ tab: "finalizados" })}>Todos</Link>
            </Button>
            <Button asChild size="sm" variant={onlyMine ? "secondary" : "ghost"}>
              <Link href={href({ tab: "finalizados", solo: "mios" })}>Solo los que jugué</Link>
            </Button>
          </div>
          {finished.items.length === 0 ? (
            <EmptyState title={onlyMine ? "Todavía no terminaste ningún torneo" : "Todavía no terminó ningún torneo"} />
          ) : (
            <Section>{finished.items.map((t) => card(t))}</Section>
          )}
          {finished.pages > 1 && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-3 text-sm">
              {finished.page > 1 ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={pageHref(finished.page - 1)}>
                    <ChevronLeft /> Anterior
                  </Link>
                </Button>
              ) : (
                <span className="w-24" />
              )}
              <span className="text-muted-foreground tabular-nums">
                {finished.page} de {finished.pages}
              </span>
              {finished.page < finished.pages ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={pageHref(finished.page + 1)}>
                    Siguiente <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <span className="w-24" />
              )}
            </nav>
          )}
        </div>
      )}

      {tab === "temporadas" &&
        (seasons.length === 0 ? (
          <EmptyState
            title="No hay temporadas por ahora"
            description="Una temporada es un circuito de torneos que clasifican a eliminatorias."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {seasons.map((r) => {
              const img = fileUrl(r.season.imageKey);
              const ko = r.tournaments.filter((t) => t.format === "KNOCKOUT").length;
              return (
                <Link
                  key={r.id}
                  href={`/temporadas/${r.season.slug}?n=${r.number}`}
                  className="hover:border-primary/60 overflow-hidden rounded-lg border transition-colors"
                >
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="aspect-[3/1] w-full object-cover" />
                  )}
                  <div className="grid gap-1 p-3">
                    <span className="font-semibold">
                      📅 {r.season.name} #{r.number}
                      {r.status === "FINISHED" && (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">terminada</span>
                      )}
                    </span>
                    {r.season.description && <p className="text-muted-foreground line-clamp-2 text-sm">{r.season.description}</p>}
                    <p className="text-muted-foreground text-xs">
                      {formatDate(r.startsAt, tz)} → {formatDate(r.endsAt, tz)} · {r.tournaments.length - ko} torneos
                      {ko > 0 && ` + ${ko} ${ko === 1 ? "eliminatoria" : "eliminatorias"}`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
    </>
  );
}
