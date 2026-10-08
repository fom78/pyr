import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { fileUrl } from "@/server/storage";
import { getQuizStatus } from "@/server/quiz/status";
import { readScoring } from "@/server/scoring/attempt";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuizStatusBadge } from "@/components/game/quiz-status-badge";
import { formatDateTime, toDateTimeInput } from "@/lib/format";
import { TournamentForm } from "../tournament-form";
import { TournamentActions } from "./tournament-actions";
import { TOURNAMENT_STATUS } from "../labels";

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
        actions={<TournamentActions id={t.id} status={t.status} missingQuizzes={t.quizCount - t.quizzes.length} entries={t.entries.length} cost={t.entryCost} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {editable ? (
          <TournamentForm
            id={t.id}
            timezone={tz}
            categories={categories}
            initial={{
              name: t.name,
              slug: t.slug,
              description: t.description ?? "",
              imageKey: t.imageKey,
              imageUrl: fileUrl(t.imageKey),
              categoryIds: t.categories.map((c) => c.categoryId),
              startsAt: toDateTimeInput(t.startsAt, tz),
              endsAt: toDateTimeInput(t.endsAt, tz),
              registrationOpensAt: toDateTimeInput(t.registrationOpensAt, tz),
              registrationEndsAt: toDateTimeInput(t.registrationEndsAt, tz),
              quizCount: t.quizCount,
              frequencyDays: t.frequencyDays,
              entryCost: t.entryCost,
              maxParticipants: t.maxParticipants,
              wildcardsPerQuiz: t.wildcardsPerQuiz,
              wildcards: Object.fromEntries(t.wildcards.map((w) => [w.type, w.quantity])),
              prizes: ((t.prizes as { rank: number; credits: number }[]) ?? []).map((p) => p.credits).join(", "),
              ...scoring,
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Este torneo ya no se puede editar.</p>
        )}
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Cuestionarios ({t.quizzes.length}/{t.quizCount})
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {t.quizzes.map((q) => (
                <Link key={q.id} href={`/admin/cuestionarios/${q.id}`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm hover:bg-accent/50">
                  <span>
                    {q.title}
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(q.opensAt, tz)} · {q._count.questions} preguntas · {q._count.attempts} intentos
                    </span>
                  </span>
                  <QuizStatusBadge status={getQuizStatus(q)} />
                </Link>
              ))}
              <Link href={`/admin/cuestionarios/nuevo?ref=t:${t.id}`} className="text-sm text-primary hover:underline">
                + Agregar cuestionario manualmente
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inscriptos ({t.entries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {t.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nadie todavía.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {t.entries.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span>{e.user.name}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(e.enrolledAt, tz)}</span>
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
