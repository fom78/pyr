import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/config/service";
import { PageHeader } from "@/components/common";
import { DEFAULT_TZ, toDateTimeInput } from "@/lib/format";
import { qualifierSources, suggestTournamentDefaults } from "@/server/tournaments/service";
import { TournamentForm } from "../tournament-form";

export const metadata = { title: "Nuevo torneo" };

export default async function NewTournamentPage() {
  await requirePermission("tournament.manage");
  const [categories, s, sources] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    getSettings(),
    qualifierSources(),
  ]);
  const now = new Date();
  const d = suggestTournamentDefaults(now);
  return (
    <>
      <PageHeader
        title="Nuevo torneo"
        description="Se crea como borrador. Al publicarlo, sus cuestionarios se arman solos con el banco de sus categorías."
        back={{ href: "/admin/torneos", label: "Torneos" }}
      />
      <TournamentForm
        id={null}
        categories={categories}
        now={now.toISOString()}
        sources={sources}
        initial={{
          name: "",
          slug: "",
          description: "",
          imageKey: null,
          imageUrl: null,
          categoryIds: [],
          ...d,
          startsAt: toDateTimeInput(d.startsAt, DEFAULT_TZ),
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
        }}
      />
    </>
  );
}
