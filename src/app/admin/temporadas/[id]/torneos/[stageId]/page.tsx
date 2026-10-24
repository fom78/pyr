import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { fileUrl } from "@/server/storage";
import { getSettings } from "@/server/config/service";
import { readScoring } from "@/server/scoring/attempt";
import { prizeList } from "@/server/tournaments/prizes";
import type { StageConfig } from "@/server/seasons/service";
import { PageHeader } from "@/components/common";
import { TournamentForm, type TournamentFormValues } from "../../../../torneos/tournament-form";

export const metadata = { title: "Torneo de la temporada" };

/** Alta ("nuevo") o edición de un torneo de la plantilla de una temporada. */
export default async function SeasonStagePage({ params }: { params: Promise<{ id: string; stageId: string }> }) {
  await requirePermission("tournament.manage");
  const { id, stageId } = await params;
  const isNew = stageId === "nuevo";
  const [season, stage, categories, s] = await Promise.all([
    prisma.season.findUnique({ where: { id }, select: { id: true, name: true } }),
    isNew ? null : prisma.seasonStage.findFirst({ where: { id: stageId, seasonId: id } }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    getSettings(),
  ]);
  if (!season || (!isNew && !stage)) notFound();
  const c = stage ? (stage.config as unknown as StageConfig) : null;
  const initial: TournamentFormValues = c
    ? {
        name: stage!.name,
        slug: "",
        description: c.description ?? "",
        imageKey: c.imageKey ?? null,
        imageUrl: fileUrl(c.imageKey ?? null),
        categoryIds: c.categoryIds,
        startsAt: "",
        quizCount: c.quizCount,
        frequencyHours: c.frequencyHours,
        quizActiveHours: c.quizActiveHours,
        registrationLeadDays: c.registrationLeadDays,
        lateEntryDays: c.lateEntryDays,
        questionsPerQuiz: c.questionsPerQuiz,
        autoQuizzes: c.autoQuizzes,
        repeatEveryDays: null,
        entryCost: c.entryCost,
        maxParticipants: c.maxParticipants,
        wildcardsPerQuiz: c.wildcardsPerQuiz,
        wildcards: Object.fromEntries(c.wildcards.map((w) => [w.type, w.quantity])),
        prizes: prizeList(c.prizes, "credits"),
        prizeStars: prizeList(c.prizes, "stars"),
        ...readScoring(c.scoring, { base: 100, timeBonus: 50, wrongPenalty: 0 }),
        format: c.format,
        seeding: c.seeding,
        autoConfirmQualified: c.autoConfirmQualified,
        thirdPlaceMatch: c.thirdPlaceMatch,
        questionSource: c.questionSource,
        uniqueQuestions: c.uniqueQuestions,
        qualifiers: [],
      }
    : {
        name: "",
        slug: "",
        description: "",
        imageKey: null,
        imageUrl: null,
        categoryIds: [],
        startsAt: "",
        quizCount: 7,
        frequencyHours: 24,
        quizActiveHours: 24,
        registrationLeadDays: 3,
        lateEntryDays: 0,
        questionsPerQuiz: 10,
        autoQuizzes: true,
        repeatEveryDays: null,
        entryCost: 30,
        maxParticipants: null,
        wildcardsPerQuiz: s["tournament.wildcardsPerQuiz"],
        wildcards: { DOUBLE_TOTAL: 1, DOUBLE_PER_CORRECT: 1, TRIPLE_SURPRISE: 1 },
        prizes: "150, 75, 30",
        prizeStars: "",
        base: s["scoring.base"],
        timeBonus: s["scoring.timeBonus"],
        wrongPenalty: s["scoring.wrongPenalty"],
        format: "POINTS",
        seeding: "QUALIFICATION",
        autoConfirmQualified: true,
        thirdPlaceMatch: false,
        questionSource: "NEW_FIRST",
        uniqueQuestions: null,
        qualifiers: [],
      };
  return (
    <>
      <PageHeader
        title={isNew ? "Nuevo torneo de la temporada" : stage!.name}
        description={`Plantilla de ${season.name}: las fechas son relativas al día 0 de cada instancia. Cambiarla no afecta a las instancias ya lanzadas.`}
        back={{ href: `/admin/temporadas/${season.id}`, label: season.name }}
      />
      <TournamentForm
        id={null}
        categories={categories}
        now={new Date().toISOString()}
        initial={initial}
        stage={{ seasonId: season.id, stageId: stage?.id ?? null, offsetDays: stage?.offsetDays ?? 0, startTime: stage?.startTime ?? "20:00" }}
      />
    </>
  );
}
