import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Copy } from "lucide-react";
import { requirePermission, userCan } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isQuestionLocked, questionInclude, toInput } from "@/server/questions/service";
import { fileUrl } from "@/server/storage";
import { getQuizStatus, STATUS_LABEL } from "@/server/quiz/status";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { QuestionEditor } from "../question-editor";
import { ReviewBadge } from "../review-badge";
import { ReviewPanel } from "./review-panel";
import { archiveQuestionAction, duplicateQuestionAction } from "../actions";

export const metadata = { title: "Pregunta" };

export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardada?: string }>;
}) {
  const user = await requirePermission("question.create");
  const { id } = await params;
  const { guardada } = await searchParams;
  const q = await prisma.question.findUnique({
    where: { id },
    include: {
      ...questionInclude,
      parent: { select: { id: true, version: true } },
      children: { select: { id: true, version: true } },
      quizQuestions: { include: { quiz: true }, orderBy: { quiz: { opensAt: "desc" } } },
    },
  });
  if (!q) notFound();
  const [categories, locked, canReview, canAutoApprove] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    isQuestionLocked(id),
    userCan(user, "question.review"),
    userCan(user, "question.autoApprove"),
  ]);
  const input = toInput(q);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Pregunta {q.version > 1 && <span className="text-muted-foreground">v{q.version}</span>} <ReviewBadge status={q.status} />
          </span>
        }
        description={`Creada por ${q.author?.name ?? "—"} el ${formatDateTime(q.createdAt, user.timezone)}${q.archived ? " · archivada" : ""}`}
        back={{ href: "/admin/preguntas", label: "Preguntas" }}
        actions={
          <>
            <form action={duplicateQuestionAction.bind(null, q.id)}>
              <Button variant="outline" type="submit">
                <Copy /> Duplicar
              </Button>
            </form>
            <form action={archiveQuestionAction.bind(null, q.id, !q.archived)}>
              <Button variant="outline" type="submit">
                {q.archived ? <ArchiveRestore /> : <Archive />} {q.archived ? "Desarchivar" : "Archivar"}
              </Button>
            </form>
          </>
        }
      />
      {guardada && <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Cambios guardados.</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <QuestionEditor
          key={q.updatedAt.toISOString()}
          id={q.id}
          locked={locked}
          categories={categories}
          canAutoApprove={canAutoApprove}
          initial={{
            ...input,
            imageUrl: fileUrl(q.imageKey),
            options: q.options.map((o) => ({ text: o.text ?? undefined, imageKey: o.imageKey ?? undefined, imageUrl: fileUrl(o.imageKey) })),
          }}
        />
        <aside className="grid content-start gap-4">
          {canReview && <ReviewPanel id={q.id} status={q.status} comment={q.reviewComment} />}
          {q.reviewedBy && (
            <p className="text-xs text-muted-foreground">
              Última revisión: {q.reviewedBy.name}
              {q.reviewedAt ? `, ${formatDateTime(q.reviewedAt, user.timezone)}` : ""}
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usada en cuestionarios</CardTitle>
            </CardHeader>
            <CardContent>
              {q.quizQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nunca se usó.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {q.quizQuestions.map((qq) => (
                    <li key={qq.id}>
                      <Link href={`/admin/cuestionarios/${qq.quizId}`} className="font-medium hover:underline">
                        {qq.quiz.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {STATUS_LABEL[getQuizStatus(qq.quiz)]} · {formatDate(qq.quiz.opensAt, user.timezone)}
                        {qq.voided && " · anulada"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {(q.parent || q.children.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Versiones</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {q.parent && (
                  <Link className="hover:underline" href={`/admin/preguntas/${q.parent.id}`}>
                    ← Versión anterior (v{q.parent.version})
                  </Link>
                )}
                {q.children.map((c) => (
                  <Link key={c.id} className="hover:underline" href={`/admin/preguntas/${c.id}`}>
                    → Versión nueva (v{c.version})
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
