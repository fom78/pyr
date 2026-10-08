import Link from "next/link";
import { FileSpreadsheet, Plus, Search } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { searchQuestions, type QuestionSearch } from "@/server/questions/service";
import { prisma } from "@/server/db";
import { EmptyState, PageHeader, Pager, parsePage, str } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { ReviewBadge } from "./review-badge";
import { formatDate } from "@/lib/format";
import type { ReviewStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Preguntas" };

type SP = Record<string, string | string[] | undefined>;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("question.create");
  const sp = await searchParams;
  const unusedRaw = str(sp.unused);
  const filters: QuestionSearch = {
    q: str(sp.q),
    categoryId: str(sp.category),
    tag: str(sp.tag),
    difficulty: sp.difficulty ? Number(sp.difficulty) : undefined,
    status: (str(sp.status) as ReviewStatus) || undefined,
    unused: unusedRaw === "never" ? "never" : unusedRaw ? Number(unusedRaw) : undefined,
    includeArchived: sp.archived === "1",
    page: parsePage(sp.page),
  };
  const [result, categories, pending] = await Promise.all([
    searchQuestions(filters),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, icon: true } }),
    prisma.question.count({ where: { status: "PENDING_REVIEW", archived: false } }),
  ]);

  return (
    <>
      <PageHeader
        title="Preguntas"
        description={`${result.total} resultado${result.total === 1 ? "" : "s"}`}
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

      <form className="mb-4 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
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
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">
            <Search /> Filtrar
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/preguntas">Limpiar</Link>
          </Button>
        </div>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title="No hay preguntas con esos filtros" />
      ) : (
        <ul className="grid gap-2">
          {result.items.map((q) => {
            const last = q.quizQuestions[0]?.quiz;
            return (
              <li key={q.id}>
                <Link href={`/admin/preguntas/${q.id}`} className="block rounded-lg border p-3 transition-colors hover:bg-accent/50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-pretty">{q.text ?? <em className="text-muted-foreground">(solo imagen)</em>}</p>
                    <ReviewBadge status={q.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
                      · {q._count.quizQuestions === 0 ? "nunca usada" : `usada en ${q._count.quizQuestions} (última: ${last ? formatDate(last.opensAt, user.timezone) : "-"})`}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={result.page} pages={result.pages} searchParams={sp} basePath="/admin/preguntas" />
    </>
  );
}
