import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getQuizStatus } from "@/server/quiz/status";
import type { Prisma } from "@/generated/prisma/client";
import type { QuizStatus } from "@/generated/prisma/enums";
import { EmptyState, PageHeader, Pager, parsePage, str } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { formatDateTime } from "@/lib/format";
import { QuizStatusBadge } from "@/components/game/quiz-status-badge";
import { quizRefOptions } from "./refs";

export const metadata = { title: "Cuestionarios" };

const PAGE_SIZE = 20;

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("quiz.manage");
  const sp = await searchParams;
  const ref = str(sp.ref) ?? "";
  const status = str(sp.status) as QuizStatus | undefined;
  const page = parsePage(sp.page);
  const now = new Date();

  const where: Prisma.QuizWhereInput = {};
  if (ref.startsWith("c:")) Object.assign(where, { categoryId: ref.slice(2), tournamentId: null });
  if (ref.startsWith("t:")) where.tournamentId = ref.slice(2);
  // Filtro por estado derivado de fechas (no del caché)
  if (status === "DRAFT") where.publishedAt = null;
  if (status === "SCHEDULED") Object.assign(where, { publishedAt: { not: null }, opensAt: { gt: now } });
  if (status === "ACTIVE") Object.assign(where, { publishedAt: { not: null }, opensAt: { lte: now }, closesAt: { gt: now } });
  if (status === "CLOSED") Object.assign(where, { publishedAt: { not: null }, closesAt: { lte: now }, expiresAt: { gt: now } });
  if (status === "EXPIRED") Object.assign(where, { publishedAt: { not: null }, expiresAt: { lte: now } });

  const [total, quizzes, refs] = await Promise.all([
    prisma.quiz.count({ where }),
    prisma.quiz.findMany({
      where,
      orderBy: { opensAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { name: true, icon: true } },
        tournament: { select: { name: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    }),
    quizRefOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Cuestionarios"
        description={`${total} en total`}
        actions={
          <Button asChild>
            <Link href={`/admin/cuestionarios/nuevo${ref ? `?ref=${ref}` : ""}`}>
              <Plus /> Nuevo cuestionario
            </Link>
          </Button>
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="grid min-w-52 flex-1 gap-1">
          <Label htmlFor="ref">Categoría / torneo</Label>
          <NativeSelect id="ref" name="ref" defaultValue={ref}>
            <option value="">Todos</option>
            {refs.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid min-w-40 gap-1">
          <Label htmlFor="status">Estado</Label>
          <NativeSelect id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Todos</option>
            <option value="DRAFT">Borrador</option>
            <option value="SCHEDULED">Programado</option>
            <option value="ACTIVE">Vigente</option>
            <option value="CLOSED">Cerrado</option>
            <option value="EXPIRED">Historial</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {quizzes.length === 0 ? (
        <EmptyState title="No hay cuestionarios" description="Creá uno nuevo o copiá uno existente." />
      ) : (
        <ul className="grid gap-2">
          {quizzes.map((q) => (
            <li key={q.id}>
              <Link href={`/admin/cuestionarios/${q.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-accent/50">
                <div className="grid gap-0.5">
                  <span className="font-medium">{q.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {q.tournament ? `🏆 ${q.tournament.name}` : `${q.category?.icon ?? ""} ${q.category?.name ?? ""}`} · abre{" "}
                    {formatDateTime(q.opensAt, user.timezone)} · cierra {formatDateTime(q.closesAt, user.timezone)} · {q._count.questions} preguntas ·{" "}
                    {q._count.attempts} intentos
                  </span>
                </div>
                <QuizStatusBadge status={getQuizStatus(q, now)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} searchParams={sp} basePath="/admin/cuestionarios" />
    </>
  );
}
