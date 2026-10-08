import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/config/service";
import { PageHeader } from "@/components/common";
import { toDateTimeInput } from "@/lib/format";
import { suggestTournamentDates } from "@/server/tournaments/service";
import { TournamentForm } from "../tournament-form";

export const metadata = { title: "Nuevo torneo" };

export default async function NewTournamentPage() {
  const user = await requirePermission("tournament.manage");
  const [categories, s] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    getSettings(),
  ]);
  const tz = user.timezone;
  const d = suggestTournamentDates();
  return (
    <>
      <PageHeader title="Nuevo torneo" description="Se crea como borrador. Después generás sus cuestionarios y lo publicás." back={{ href: "/admin/torneos", label: "Torneos" }} />
      <TournamentForm
        id={null}
        timezone={tz}
        categories={categories}
        initial={{
          name: "",
          slug: "",
          description: "",
          imageKey: null,
          imageUrl: null,
          categoryIds: [],
          startsAt: toDateTimeInput(d.startsAt, tz),
          endsAt: toDateTimeInput(d.endsAt, tz),
          registrationOpensAt: toDateTimeInput(d.registrationOpensAt, tz),
          registrationEndsAt: toDateTimeInput(d.registrationEndsAt, tz),
          quizCount: 5,
          frequencyDays: 4,
          entryCost: 30,
          maxParticipants: null,
          wildcardsPerQuiz: s["tournament.wildcardsPerQuiz"],
          wildcards: { DOUBLE_TOTAL: 1, DOUBLE_PER_CORRECT: 1, TRIPLE_SURPRISE: 1 },
          prizes: "150, 75, 30",
          base: s["scoring.base"],
          timeBonus: s["scoring.timeBonus"],
          wrongPenalty: s["scoring.wrongPenalty"],
        }}
      />
    </>
  );
}
