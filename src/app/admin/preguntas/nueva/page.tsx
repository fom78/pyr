import { requirePermission, userCan } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/common";
import { QuestionEditor } from "../question-editor";

export const metadata = { title: "Nueva pregunta" };

export default async function NewQuestionPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await requirePermission("question.create");
  const { category } = await searchParams;
  const [categories, canAutoApprove] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    userCan(user, "question.autoApprove"),
  ]);
  return (
    <>
      <PageHeader
        title="Nueva pregunta"
        description="Queda pendiente de revisión hasta que un moderador la apruebe."
        back={{ href: "/admin/preguntas", label: "Preguntas" }}
      />
      <QuestionEditor
        id={null}
        categories={categories}
        locked={false}
        canAutoApprove={canAutoApprove}
        initial={
          category
            ? { type: "TEXT", difficulty: 2, categoryIds: [category], tags: [], shuffleOptions: null, options: [{}, {}, {}, {}], correctIndex: 0 }
            : undefined
        }
      />
    </>
  );
}
