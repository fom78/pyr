import Link from "next/link";
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
import { formatDateTime, formatHours, formatNumber } from "@/lib/format";
import { parsePrizes, prizeText } from "@/server/tournaments/prizes";
import { EnrollButton } from "./enroll-button";
import { seasonContext } from "@/server/seasons/service";
import { ConfirmQualificationButton } from "./confirm-button";
import { Bracket } from "@/components/game/bracket";
import { getBracket, knockoutCapacity } from "@/server/tournaments/knockout";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, select: { name: true } });
  return { title: t?.name ?? "Torneo" };
}

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const { tab } = await searchParams;
  const t = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      categories: { include: { category: true } },
      wildcards: true,
      quizzes: {
        where: { publishedAt: { not: null } },
        include: { _count: { select: { questions: { where: { voided: false } } } } },
      },
      standings: {
        orderBy: [{ rank: "asc" }, { userId: "asc" }],
        take: 100,
        include: { user: { select: { name: true, username: true } } },
      },
      _count: { select: { entries: true } },
    },
  });
  if (!t || t.status === "DRAFT") notFound();
  const now = new Date();
  const tz = user.timezone;
  const ko = t.format === "KNOCKOUT";
  const [entry, balance, attempts, result, bracket, capacity, season] = await Promise.all([
    prisma.tournamentEntry.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId: user.id } } }),
    getBalance(user.id),
    prisma.attempt.findMany({ where: { userId: user.id, quizId: { in: t.quizzes.map((q) => q.id) } } }),
    prisma.tournamentResult.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId: user.id } } }),
    ko ? getBracket(t.id) : null,
    ko ? knockoutCapacity(t.id) : null,
    seasonContext(t),
  ]);
  const wildcardsLeft = entry ? await remainingWildcards(t.id, user.id) : [];
  const reg = registrationState(t, now);
  const scoring = readScoring(t.scoring, { base: 100, timeBonus: 50, wrongPenalty: 0 });
  const prizes = parsePrizes(t.prizes);
  const full = capacity ? capacity.open <= 0 : Boolean(t.maxParticipants && t._count.entries >= t.maxParticipants);
  // Eliminatoria: solo se listan los partidos propios.
  const myQuizIds = new Set(
    bracket?.matches.filter((m) => m.quizId && (m.a?.id === user.id || m.b?.id === user.id)).map((m) => m.quizId),
  );
  const quizzes = t.quizzes
    .filter((q) => !ko || myQuizIds.has(q.id))
    .map((q) => ({
      ...q,
      derived: getQuizStatus(q, now),
      questionCount: q._count.questions,
      attempt: attempts.find((a) => a.quizId === q.id) ?? null,
    }))
    .sort(
      (a, b) => STATUS_DISPLAY_ORDER[a.derived] - STATUS_DISPLAY_ORDER[b.derived] || a.opensAt.getTime() - b.opensAt.getTime(),
    );
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
      {ko && capacity ? (
        <>
          <li>
            <strong>Eliminatoria</strong> de hasta {capacity.max} jugadores
            {capacity.qualifiersOnly
              ? ". Se entra solo por clasificación desde otros torneos"
              : capacity.reserved > 0 && ` (${capacity.reserved} lugares reservados para clasificados de otros torneos)`}
            . Si {capacity.qualifiersOnly ? "clasifican" : "se anotan"} menos, el cuadro se achica y los que faltan son pases
            libres para los mejores sembrados.
          </li>
          <li>
            Un partido por ronda contra un rival, con un cuestionario igual para los dos (mezclado). Cada ronda dura{" "}
            {formatHours(t.frequencyHours)}.
          </li>
          <li>
            Gana quien hace más puntos; si empatan, más aciertos, después menos tiempo y por último el mejor sembrado. Quien no
            juega a tiempo pierde por W.O. El resultado se conoce cuando jugaron los dos.
          </li>
          {t.thirdPlaceMatch && <li>Los que pierden las semifinales juegan por el tercer puesto.</li>}
        </>
      ) : (
        <li>
          {t.quizCount} cuestionarios, {t.frequencyHours === 24 ? "uno por día" : `uno cada ${formatHours(t.frequencyHours)}`};
          cada uno queda abierto {formatHours(t.quizActiveHours)}. Suman <strong>todos</strong>.
        </li>
      )}
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
      {prizes.length > 0 && (
        <li>
          Premios: {prizes.map((p) => `${ko ? koPlace(p.rank) : `${p.rank}° puesto`} ${prizeText(p)}`).join(" · ")}.{" "}
          {ko ? "Los que caen en la misma ronda cobran lo mismo." : "Los empates cobran el premio del puesto."}
        </li>
      )}
      {season && season.feeds.length > 0 && (
        <li>
          Clasificación:{" "}
          {season.feeds
            .map((f) => `${f.fromRank > 1 ? `puestos ${f.fromRank} a ${f.toRank}` : `los primeros ${f.toRank}`} → ${f.name}`)
            .join(" · ")}
          {season.feeds.length > 1 && " (si clasificás a dos, vas a la de mejor nivel)"}. Entran gratis al terminar este torneo.
        </li>
      )}
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
          entry && !entry.confirmedAt && reg === "OPEN" ? (
            <ConfirmQualificationButton tournamentId={t.id} />
          ) : entry ? (
            <Badge className="h-8 px-3">✓ Inscripto</Badge>
          ) : t.status === "PUBLISHED" && reg === "OPEN" && !user.banned ? (
            capacity?.qualifiersOnly ? (
              <Badge variant="secondary">Por clasificación</Badge>
            ) : full ? (
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
      {season?.slug && (
        <p className="mb-4 text-sm">
          <Link href={`/temporadas/${season.slug}`} className="text-primary underline-offset-2 hover:underline">
            📅 Parte de {season.name} #{season.number}
          </Link>
          {season.feeds.length > 0 && (
            <span className="text-muted-foreground">
              {" "}
              ·{" "}
              {season.feeds
                .map((f) => `${f.fromRank > 1 ? `${f.fromRank}°–${f.toRank}°` : `top ${f.toRank}`} → ${f.name}`)
                .join(" · ")}
            </span>
          )}
        </p>
      )}
      {t.description && <p className="text-muted-foreground mb-6 text-pretty">{t.description}</p>}
      {t.status === "FINISHED" &&
        (result ? (
          <p className="bg-muted mb-6 rounded-md p-3 text-sm">
            <strong>
              {result.rank <= 3 ? `${["🥇", "🥈", "🥉"][result.rank - 1]} ` : ""}Terminaste #{result.rank} de{" "}
              {result.participants}
            </strong>{" "}
            con {formatNumber(result.points)} puntos ({result.quizzesPlayed} de {result.quizzesTotal} cuestionarios)
            {(result.prizeCredits > 0 || result.prizeStars > 0) && (
              <> · ganaste {prizeText({ credits: result.prizeCredits, stars: result.prizeStars })}</>
            )}
            .
          </p>
        ) : (
          <p className="bg-muted mb-6 rounded-md p-3 text-sm">Este torneo finalizó. ¡Gracias por participar!</p>
        ))}
      {entry && me && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">#{me.rank}</p>
              <p className="text-muted-foreground text-xs">posición</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{formatNumber(me.points)}</p>
              <p className="text-muted-foreground text-xs">puntos</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="py-3 text-center text-sm">
              {wildcardsLeft.length
                ? wildcardsLeft.map((w) => `${wildcardStrategies[w.type].name}: ${w.remaining}`).join(" · ")
                : "Sin comodines"}
              <p className="text-muted-foreground text-xs">comodines restantes</p>
            </CardContent>
          </Card>
        </div>
      )}
      {entry?.qualifiedFromId && !entry.confirmedAt && (
        <p className="bg-warning/15 mb-6 rounded-md p-3 text-sm">
          Clasificaste ({entry.qualifiedRank}° puesto): confirmá tu lugar antes del {formatDateTime(t.registrationEndsAt, tz)} o
          lo perdés.
        </p>
      )}
      {ko && capacity && reg === "OPEN" && !capacity.qualifiersOnly && (
        <p className="text-muted-foreground mb-4 text-sm">
          {capacity.open} de {capacity.max} lugares abiertos
          {capacity.reserved > 0 && `, ${capacity.reserved} reservados para clasificados`} · {capacity.entries} inscriptos.
        </p>
      )}
      <Tabs defaultValue={tab === "tabla" || (ko && !entry) ? "tabla" : entry ? "cuestionarios" : "reglamento"}>
        <TabsList className="mb-4">
          <TabsTrigger value="cuestionarios">{ko ? "Mis partidos" : "Cuestionarios"}</TabsTrigger>
          <TabsTrigger value="tabla">{ko ? "Cuadro" : "Tabla"}</TabsTrigger>
          <TabsTrigger value="reglamento">Reglamento</TabsTrigger>
        </TabsList>
        <TabsContent value="cuestionarios" className="grid gap-2">
          {quizzes.length === 0 ? (
            <EmptyState
              title={ko ? "Todavía no tenés un partido armado" : "Todavía no hay cuestionarios publicados"}
              description={ko ? "Tu partido aparece acá cuando se conocen los dos jugadores." : undefined}
            />
          ) : (
            quizzes.map((q) => <QuizCard key={q.id} q={q} canPlay={Boolean(entry) && !user.banned} tz={tz} />)
          )}
          {!entry && quizzes.length > 0 && (
            <p className="text-muted-foreground text-sm">Para jugar tenés que inscribirte en el torneo.</p>
          )}
        </TabsContent>
        <TabsContent value="tabla">
          {ko ? (
            bracket?.matches.length ? (
              <Bracket bracket={bracket} meId={user.id} tz={tz} />
            ) : (
              <EmptyState
                title="El cuadro todavía no está armado"
                description={`Se sortea al cerrar la inscripción (${formatDateTime(t.registrationEndsAt, tz)}).`}
              />
            )
          ) : t.standings.length === 0 ? (
            <EmptyState
              title="La tabla está vacía"
              description="Se actualiza a medida que los participantes terminan los cuestionarios."
            />
          ) : (
            <StandingsTable
              rows={t.standings}
              meId={user.id}
              countedLabel="Jugados"
              countedHelp="En torneo suman todos los cuestionarios jugados."
            />
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

/** Puesto de premio en una eliminatoria: 1 campeón, 2 finalista, 3 semifinal, 5 cuartos… */
function koPlace(rank: number) {
  if (rank === 1) return "Campeón";
  if (rank === 2) return "Finalista";
  if (rank === 3) return "3° puesto";
  if (rank === 4) return "4° puesto";
  const reached = (rank - 1) * 2;
  return reached === 8 ? "Llegar a cuartos" : reached === 16 ? "Llegar a octavos" : `Llegar a la ronda de ${reached}`;
}
