import { requirePermission } from "@/server/auth/session";
import { suggestQuizDefaults } from "@/server/quiz/service";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/common";
import { toDateTimeInput } from "@/lib/format";
import { QuizForm } from "../quiz-form";
import { quizRefOptions } from "../refs";

export const metadata = { title: "Nuevo cuestionario" };

export default async function NewQuizPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const user = await requirePermission("quiz.manage");
  const { ref = "" } = await searchParams;
  const categoryId = ref.startsWith("c:") ? ref.slice(2) : null;
  const tournament = ref.startsWith("t:") ? await prisma.tournament.findUnique({ where: { id: ref.slice(2) } }) : null;
  const d = await suggestQuizDefaults(categoryId);
  const opensAt = tournament ? (tournament.startsAt > new Date() ? tournament.startsAt : d.opensAt) : d.opensAt;
  const tz = user.timezone;
  return (
    <>
      <PageHeader
        title="Nuevo cuestionario"
        description="Se crea como borrador. Después agregás las preguntas y lo publicás."
        back={{ href: "/admin/cuestionarios", label: "Cuestionarios" }}
      />
      <QuizForm
        id={null}
        mode="full"
        timezone={tz}
        refs={await quizRefOptions()}
        initial={{
          title: "",
          description: "",
          ref,
          opensAt: toDateTimeInput(opensAt, tz),
          closesAt: toDateTimeInput(tournament ? new Date(Math.min(d.closesAt.getTime(), tournament.endsAt.getTime())) : d.closesAt, tz),
          expiresAt: toDateTimeInput(tournament ? tournament.endsAt : d.expiresAt, tz),
          timeMode: "PER_QUESTION",
          timeLimitSec: d.timeLimitSec,
          shuffleQuestions: true,
          shuffleOptions: true,
          ...d.scoring,
        }}
      />
    </>
  );
}
