import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { fileUrl } from "@/server/storage";
import { getQuizStatus } from "@/server/quiz/status";
import { readScoring } from "@/server/scoring/attempt";
import { tournamentSlots } from "@/server/tournaments/auto";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuizStatusBadge } from "@/components/game/quiz-status-badge";
import { DEFAULT_TZ, formatDateTime, toDateTimeInput } from "@/lib/format";
import { TournamentForm } from "../tournament-form";
import { TournamentActions } from "./tournament-actions";
import { TOURNAMENT_STATUS } from "../labels";
import { prizeList } from "@/server/tournaments/prizes";

export const metadata = { title: "Torneo" };

export default async function AdminTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("tournament.manage");
  const { id } = await params;
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      categories: true,
      wildcards: true,
      quizzes: { orderBy: { opensAt: "asc" }, include: { _count: { select: { questions: true, attempts: true } } } },
      entries: { include: { user: { select: { name: true, username: true } } }, orderBy: { enrolledAt: "asc" } },
    },
  });
  if (!t) notFound();
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } });
  const tz = user.timezone;
  const scoring = readScoring(t.scoring, { base: 100, timeBonus: 50, wrongPenalty: 0 });
  const editable = t.status === "DRAFT" || t.status === "PUBLISHED";
  const now = new Date();
  const slots = await tournamentSlots(t, now);
  const inSlots = new Set(slots.map((x) => x.quiz?.id).filter(Boolean));
  const series = t.seriesId
    ? await prisma.tournament.findMany({
        where: { OR: [{ id: t.seriesId }, { seriesId: t.seriesId }] },
        orderBy: { edition: "asc" },
        select: { id: true, name: true, edition: true, status: true },
      })
    : [];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/torneos", label: "Torneos" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t.name} <Badge variant="secondary">{TOURNAMENT_STATUS[t.status]}</Badge>
          </span>
        }
        description={
          t.status !== "DRAFT" ? (
            <Link className="underline" href={`/torneos/${t.slug}`}>
              Ver como jugador
            </Link>
          ) : (
            "Borrador: no es visible para los jugadores."
          )
        }
        actions={
          <TournamentActions
            id={t.id}
            status={t.status}
            missingQuizzes={t.autoQuizzes ? 0 : slots.filter((x) => !x.quiz).length}
            entries={t.entries.length}
            cost={t.entryCost}
            repeats={Boolean(t.repeatEveryDays)}
          />
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {editable ? (
          <TournamentForm
            id={t.id}
            categories={categories}
            started={t.startsAt <= now}
            now={now.toISOString()}
            initial={{
              name: t.name,
              slug: t.slug,
              description: t.description ?? "",
              imageKey: t.imageKey,
              imageUrl: fileUrl(t.imageKey),
              categoryIds: t.categories.map((c) => c.categoryId),
              startsAt: toDateTimeInput(t.startsAt, DEFAULT_TZ),
              quizCount: t.quizCount,
              frequencyHours: t.frequencyHours,
              quizActiveHours: t.quizActiveHours,
              registrationLeadDays: t.registrationLeadDays,
              lateEntryDays: t.lateEntryDays,
              questionsPerQuiz: t.questionsPerQuiz,
              autoQuizzes: t.autoQuizzes,
              repeatEveryDays: t.repeatEveryDays,
              entryCost: t.entryCost,
              maxParticipants: t.maxParticipants,
              wildcardsPerQuiz: t.wildcardsPerQuiz,
              wildcards: Object.fromEntries(t.wildcards.map((w) => [w.type, w.quantity])),
              prizes: prizeList(t.prizes, "credits"),
              prizeStars: prizeList(t.prizes, "stars"),
              ...scoring,
            }}
          />
        ) : (
          <p className="text-muted-foreground text-sm">Este torneo ya no se puede editar.</p>
        )}
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Cuestionarios ({slots.filter((x) => x.quiz).length}/{t.quizCount})
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.autoQuizzes
                  ? `Se arman solos con el banco de sus categorías (${t.questionsPerQuiz} preguntas) mientras el torneo está publicado, y pasan por "Por aprobar".`
                  : "Manuales: generá los que faltan y cargales las preguntas."}
              </p>
            </CardHeader>
            <CardContent className="grid gap-2">
              {slots.map((x) =>
                x.quiz ? (
                  <Link
                    key={x.at.toISOString()}
                    href={`/admin/cuestionarios/${x.quiz.id}`}
                    className="hover:bg-accent/50 flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <span>
                      {x.quiz.title}
                      <span className="text-muted-foreground block text-xs">
                        {formatDateTime(x.at, tz)} · {x.quiz.questions}/{t.questionsPerQuiz} preguntas
                      </span>
                    </span>
                    <Badge variant={x.quiz.published ? "default" : "outline"}>{x.quiz.published ? "Publicado" : "Borrador"}</Badge>
                  </Link>
                ) : (
                  <div
                    key={x.at.toISOString()}
                    className="text-muted-foreground flex items-center justify-between gap-2 rounded-md border border-dashed p-2 text-sm"
                  >
                    <span>
                      Fecha {x.n}
                      <span className="block text-xs">{formatDateTime(x.at, tz)}</span>
                    </span>
                    <span className="text-xs">
                      {x.skipped
                        ? "Salteado"
                        : !t.autoQuizzes
                          ? "Sin cuestionario"
                          : t.status === "DRAFT"
                            ? "Se arma al publicar"
                            : "Se arma pronto"}
                    </span>
                  </div>
                ),
              )}
              {t.quizzes
                .filter((q) => !inSlots.has(q.id))
                .map((q) => (
                  <Link
                    key={q.id}
                    href={`/admin/cuestionarios/${q.id}`}
                    className="hover:bg-accent/50 flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <span>
                      {q.title}
                      <span className="text-muted-foreground block text-xs">
                        {formatDateTime(q.opensAt, tz)} · fuera del calendario · {q._count.questions} preguntas
                      </span>
                    </span>
                    <QuizStatusBadge status={getQuizStatus(q)} />
                  </Link>
                ))}
              <Link href={`/admin/cuestionarios/nuevo?ref=t:${t.id}`} className="text-primary text-sm hover:underline">
                + Agregar cuestionario manualmente
              </Link>
            </CardContent>
          </Card>
          {series.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Serie</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {t.repeatEveryDays ? `Se repite cada ${t.repeatEveryDays} días.` : "Esta edición no crea la siguiente."}
                </p>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {series.map((e) => (
                  <Link key={e.id} href={`/admin/torneos/${e.id}`} className={e.id === t.id ? "font-medium" : "hover:underline"}>
                    #{e.edition} · {e.name} <span className="text-muted-foreground text-xs">({TOURNAMENT_STATUS[e.status]})</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inscriptos ({t.entries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {t.entries.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nadie todavía.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {t.entries.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span>{e.user.name}</span>
                      <span className="text-muted-foreground text-xs">{formatDateTime(e.enrolledAt, tz)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
