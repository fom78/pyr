import Link from "next/link";
import { Check, FileSpreadsheet, Plus } from "lucide-react";
import { requirePermission, userCan } from "@/server/auth/session";
import { buildQuestionWhere, searchQuestions } from "@/server/questions/service";
import { prisma } from "@/server/db";
import { EmptyState, PageHeader, Pager, str } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { AutoFilterForm } from "@/components/forms/auto-filter-form";
import { ReviewBadge } from "./review-badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseQuestionFilters } from "./filters";
import { BulkApprove, BulkCheckbox } from "./bulk-approve";

export const metadata = { title: "Preguntas" };

type SP = Record<string, string | string[] | undefined>;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("question.create");
  const sp = await searchParams;
  const unusedRaw = str(sp.unused);
  const filters = parseQuestionFilters(sp);
  const canReview = await userCan(user, "question.review");
  const [result, categories, pending, approvable] = await Promise.all([
    searchQuestions(filters),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    prisma.question.count({ where: { status: "PENDING_REVIEW", archived: false } }),
    canReview
      ? prisma.question.count({ where: { AND: [buildQuestionWhere(filters), { status: { not: "APPROVED" }, archived: false }] } })
      : 0,
  ]);
  const hasFilters = Object.entries(sp).some(([k, v]) => k !== "page" && typeof v === "string" && v !== "");
  const query = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => e[0] !== "page" && typeof e[1] === "string"),
  ).toString();
  const pageIds = canReview ? result.items.filter((q) => q.status !== "APPROVED" && !q.archived).map((q) => q.id) : [];
  const from = (result.page - 1) * result.pageSize + 1;
  const to = from + result.items.length - 1;

  return (
    <>
      <PageHeader
        title="Preguntas"
        description="Banco de preguntas. Los filtros se aplican al elegirlos."
        actions={
          <>
            {pending > 0 && (
              <Button asChild variant="outline">
                <Link href="/admin/preguntas?status=PENDING_REVIEW">Por revisar ({pending})</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/admin/importar">
                <FileSpreadsheet /> Importar
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/preguntas/nueva">
                <Plus /> Nueva
              </Link>
            </Button>
          </>
        }
      />

      <AutoFilterForm className="mb-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="q">Buscar texto</Label>
          <Input id="q" name="q" defaultValue={filters.q} placeholder="Ej: capital, mundial, oscar…" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="category">Categoría</Label>
          <NativeSelect id="category" name="category" defaultValue={filters.categoryId ?? ""}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="status">Estado de revisión</Label>
          <NativeSelect id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todos</option>
            <option value="PENDING_REVIEW">Pendiente</option>
            <option value="APPROVED">Aprobada</option>
            <option value="REJECTED">Rechazada</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="difficulty">Dificultad</Label>
          <NativeSelect id="difficulty" name="difficulty" defaultValue={filters.difficulty ?? ""}>
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="unused">Uso</Label>
          <NativeSelect id="unused" name="unused" defaultValue={unusedRaw ?? ""}>
            <option value="">Cualquiera</option>
            <option value="never">Nunca usada</option>
            <option value="30">No usada en 30 días</option>
            <option value="60">No usada en 60 días</option>
            <option value="90">No usada en 90 días</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tag">Etiqueta</Label>
          <Input id="tag" name="tag" defaultValue={filters.tag} placeholder="argentina" />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="archived" value="1" defaultChecked={filters.includeArchived} className="size-4" /> Incluir archivadas
          </label>
        </div>
      </AutoFilterForm>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm" aria-live="polite">
        <p>
          <strong className="tabular-nums">{result.total}</strong> pregunta{result.total === 1 ? "" : "s"}
          {hasFilters ? " con estos filtros" : " en total"}
          {result.total > result.items.length && (
            <span className="text-muted-foreground">
              {" "}
              · mostrando {from}–{to}
            </span>
          )}
          {canReview && approvable > 0 && <span className="text-muted-foreground"> · {approvable} sin aprobar</span>}
        </p>
        {hasFilters && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/preguntas">Limpiar filtros</Link>
          </Button>
        )}
      </div>

      {result.items.length === 0 ? (
        <EmptyState title="No hay preguntas con esos filtros" />
      ) : (
        <BulkApprove pageIds={pageIds} filterCount={approvable} query={query}>
          <ul className="grid gap-2">
            {result.items.map((q) => {
              const last = q.quizQuestions[0]?.quiz;
              return (
                <li key={q.id} className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/30">
                  {pageIds.includes(q.id) ? (
                    <BulkCheckbox id={q.id} label={`Seleccionar: ${q.text ?? "pregunta con imagen"}`} />
                  ) : (
                    canReview && <span className="w-4 shrink-0" aria-hidden />
                  )}
                  <div className="grid min-w-0 flex-1 gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link href={`/admin/preguntas/${q.id}`} className="font-medium text-pretty hover:underline">
                        {q.text ?? <em className="text-muted-foreground">(solo imagen)</em>}
                      </Link>
                      <ReviewBadge status={q.status} />
                    </div>
                    <ol className="flex flex-wrap gap-1.5 text-sm" aria-label="Opciones">
                      {q.options.map((o) => (
                        <li
                          key={o.id}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
                            o.isCorrect ? "border-success/50 bg-success/10 font-medium text-success" : "text-muted-foreground",
                          )}
                        >
                          {o.isCorrect && <Check className="size-3.5" aria-label="Correcta" />}
                          {o.text ?? <em>(imagen)</em>}
                        </li>
                      ))}
                    </ol>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {q.categories.map((c) => (
                        <Badge key={c.categoryId} variant="secondary">
                          {c.category.name}
                        </Badge>
                      ))}
                      {q.tags.map((t) => (
                        <Badge key={t.tagId} variant="outline">
                          #{t.tag.name}
                        </Badge>
                      ))}
                      <span>· dificultad {q.difficulty}</span>
                      {q.type !== "TEXT" && <span>· con imagen</span>}
                      {q.version > 1 && <span>· v{q.version}</span>}
                      {q.archived && <span>· archivada</span>}
                      <span>
                        ·{" "}
                        {q._count.quizQuestions === 0
                          ? "nunca usada"
                          : `usada en ${q._count.quizQuestions} (última: ${last ? formatDate(last.opensAt, user.timezone) : "-"})`}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </BulkApprove>
      )}
      <Pager page={result.page} pages={result.pages} searchParams={sp} basePath="/admin/preguntas" />
    </>
  );
}
