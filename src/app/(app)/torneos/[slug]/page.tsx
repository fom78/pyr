import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getBalance } from "@/server/credits/service";
import { registrationState } from "@/server/tournaments/service";
import { remainingWildcards } from "@/server/game/engine";
import { getQuizStatus, STATUS_DISPLAY_ORDER } from "@/server/quiz/status";
import { readScoring } from "@/server/scoring/attempt";
import { wildcardStrategies } from "@/server/wildcards/strategies";
import { fileUrl } from "@/server/storage";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuizCard } from "@/components/game/quiz-card";
import { StandingsTable } from "@/components/game/standings-table";
import { formatDateTime, formatNumber } from "@/lib/format";
import { EnrollButton } from "./enroll-button";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, select: { name: true } });
  return { title: t?.name ?? "Torneo" };
}

export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      categories: { include: { category: true } },
      wildcards: true,
      quizzes: { where: { publishedAt: { not: null } }, include: { _count: { select: { questions: { where: { voided: false } } } } } },
      standings: { orderBy: [{ rank: "asc" }, { userId: "asc" }], take: 100, include: { user: { select: { name: true, username: true } } } },
      _count: { select: { entries: true } },
    },
  });
  if (!t || t.status === "DRAFT") notFound();
  const now = new Date();
  const tz = user.timezone;
  const [entry, balance, attempts] = await Promise.all([
    prisma.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId: user.id } } }),
    getBalance(user.id),
    prisma.attempt.findMany({ where: { userId: user.id, quizId: { in: t.quizzes.map((q) => q.id) } } }),
  ]);
  const wildcardsLeft = entry ? await remainingWildcards(t.id, user.id) : [];
  const reg = registrationState(t, now);
  const scoring = readScoring(t.scoring, { base: 100, timeBonus: 50, wrongPenalty: 0 });
  const prizes = (t.prizes as { rank: number; credits: number }[]) ?? [];
  const full = Boolean(t.maxParticipants && t._count.entries >= t.maxParticipants);
  const quizzes = t.quizzes
    .map((q) => ({ ...q, derived: getQuizStatus(q, now), questionCount: q._count.questions, attempt: attempts.find((a) => a.quizId === q.id) ?? null }))
    .sort((a, b) => STATUS_DISPLAY_ORDER[a.derived] - STATUS_DISPLAY_ORDER[b.derived] || a.opensAt.getTime() - b.opensAt.getTime());
  const me = t.standings.find((s) => s.userId === user.id);
  const img = fileUrl(t.imageKey);

  const rules = (
    <ul className="ml-5 list-disc space-y-1 text-sm">
      <li>
        Vigencia: {formatDateTime(t.startsAt, tz)} → {formatDateTime(t.endsAt, tz)}.
      </li>
      <li>
        Inscripción: {formatDateTime(t.registrationOpensAt, tz)} → {formatDateTime(t.registrationEndsAt, tz)}.{" "}
        {t.maxParticipants ? `Cupo: ${t.maxParticipants} participantes.` : "Sin cupo máximo."}
      </li>
      <li>Costo: {t.entryCost === 0 ? "gratis" : `${t.entryCost} créditos`}. No usa vidas.</li>
      <li>
        {t.quizCount} cuestionarios, aproximadamente uno cada {t.frequencyDays} días. Suman <strong>todos</strong>.
      </li>
      <li>
        Puntaje: {scoring.base} por acierto + hasta {scoring.timeBonus} por velocidad
        {scoring.wrongPenalty ? `; los errores restan ${scoring.wrongPenalty}` : ""}.
      </li>
      <li>
        Comodines:{" "}
        {t.wildcards.length === 0 || t.wildcardsPerQuiz === 0
          ? "no se usan en este torneo."
          : `${t.wildcards.map((w) => `${wildcardStrategies[w.type].name} ×${w.quantity}`).join(", ")}. Máximo ${t.wildcardsPerQuiz} por cuestionario; se eligen antes de empezar y no se recuperan.`}
      </li>
      {prizes.length > 0 && <li>Premios: {prizes.map((p) => `${p.rank}° puesto ${p.credits} créditos`).join(" · ")}. Los empates cobran el premio del puesto.</li>}
      <li>Si el torneo se cancela, se devuelve la inscripción.</li>
    </ul>
  );

  return (
    <>
      <PageHeader
        back={{ href: "/torneos", label: "Torneos" }}
        title={t.name}
        description={t.categories.map((c) => `${c.category.icon ?? ""} ${c.category.name}`).join(" · ")}
        actions={
          entry ? (
            <Badge className="h-8 px-3">✓ Inscripto</Badge>
          ) : t.status === "PUBLISHED" && reg === "OPEN" && !user.banned ? (
            full ? (
              <Badge variant="secondary">Cupo completo</Badge>
            ) : (
              <EnrollButton tournamentId={t.id} name={t.name} cost={t.entryCost} balance={balance} rules={rules} />
            )
          ) : null
        }
      />
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="mb-6 aspect-[3/1] w-full rounded-lg object-cover" />
      )}
      {t.description && <p className="mb-6 text-pretty text-muted-foreground">{t.description}</p>}
      {t.status === "FINISHED" && <p className="mb-6 rounded-md bg-muted p-3 text-sm">Este torneo finalizó. ¡Gracias por participar!</p>}
      {entry && me && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">#{me.rank}</p>
              <p className="text-xs text-muted-foreground">posición</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{formatNumber(me.points)}</p>
              <p className="text-xs text-muted-foreground">puntos</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="py-3 text-center text-sm">
              {wildcardsLeft.length ? wildcardsLeft.map((w) => `${wildcardStrategies[w.type].name}: ${w.remaining}`).join(" · ") : "Sin comodines"}
              <p className="text-xs text-muted-foreground">comodines restantes</p>
            </CardContent>
          </Card>
        </div>
      )}
      <Tabs defaultValue={entry ? "cuestionarios" : "reglamento"}>
        <TabsList className="mb-4">
          <TabsTrigger value="cuestionarios">Cuestionarios</TabsTrigger>
          <TabsTrigger value="tabla">Tabla</TabsTrigger>
          <TabsTrigger value="reglamento">Reglamento</TabsTrigger>
        </TabsList>
        <TabsContent value="cuestionarios" className="grid gap-2">
          {quizzes.length === 0 ? (
            <EmptyState title="Todavía no hay cuestionarios publicados" />
          ) : (
            quizzes.map((q) => <QuizCard key={q.id} q={q} canPlay={Boolean(entry) && !user.banned} tz={tz} />)
          )}
          {!entry && quizzes.length > 0 && <p className="text-sm text-muted-foreground">Para jugar tenés que inscribirte en el torneo.</p>}
        </TabsContent>
        <TabsContent value="tabla">
          {t.standings.length === 0 ? (
            <EmptyState title="La tabla está vacía" description="Se actualiza a medida que los participantes terminan los cuestionarios." />
          ) : (
            <StandingsTable rows={t.standings} meId={user.id} countedLabel="Jugados" countedHelp="En torneo suman todos los cuestionarios jugados." />
          )}
        </TabsContent>
        <TabsContent value="reglamento">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reglamento</CardTitle>
            </CardHeader>
            <CardContent>{rules}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
