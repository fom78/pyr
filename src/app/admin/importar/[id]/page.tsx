import { notFound } from "next/navigation";
import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import type { StoredRow } from "@/server/import/excel";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { commitImportAction, discardImportAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Previsualizar importación" };

export default async function ImportPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission("question.import");
  const { id } = await params;
  const { error } = await searchParams;
  const job = await prisma.importJob.findUnique({ where: { id } });
  if (!job || job.authorId !== user.id) notFound();
  const rows = job.rows as unknown as StoredRow[];
  const categories = new Map((await prisma.category.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const pending = job.status === "PREVIEW";

  return (
    <>
      <PageHeader
        title={job.fileName}
        description={
          job.status === "COMMITTED"
            ? `Importación confirmada: se crearon ${job.createdCount} preguntas.`
            : job.status === "DISCARDED"
              ? "Importación descartada."
              : `${job.validCount} filas válidas · ${job.invalidCount} con errores${job.autoApprove ? " · se aprobarán directamente" : " · quedarán pendientes de revisión"}`
        }
        back={{ href: "/admin/importar", label: "Importar" }}
      />
      {error && <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {pending && (
        <div className="mb-6 flex flex-wrap gap-2">
          <form action={commitImportAction.bind(null, job.id, "valid")}>
            <SubmitButton disabled={job.validCount === 0} pendingText="Importando…">
              Importar solo las válidas ({job.validCount})
            </SubmitButton>
          </form>
          <form action={commitImportAction.bind(null, job.id, "all")}>
            <SubmitButton variant="outline" disabled={job.invalidCount > 0} pendingText="Importando…" title={job.invalidCount > 0 ? "Hay filas con errores" : undefined}>
              Importar todo
            </SubmitButton>
          </form>
          <form action={discardImportAction.bind(null, job.id)}>
            <Button variant="ghost" type="submit">
              Descartar
            </Button>
          </form>
        </div>
      )}
      <ul className="grid gap-2">
        {rows.map((r) => {
          const ok = r.errors.length === 0;
          return (
            <li key={r.row} className={cn("rounded-lg border p-3 text-sm", !ok && "border-destructive/50 bg-destructive/5")}>
              <div className="flex items-start gap-2">
                {ok ? (
                  r.warnings.length ? (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Válida con advertencias" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Válida" />
                  )
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Con errores" />
                )}
                <div className="grid min-w-0 gap-1">
                  <p>
                    <span className="text-muted-foreground">Fila {r.row}:</span> {r.raw.pregunta || <em>(sin texto)</em>}
                  </p>
                  {r.input && (
                    <div className="flex flex-wrap gap-1">
                      {r.input.categoryIds.map((c) => (
                        <Badge key={c} variant="secondary">
                          {categories.get(c)}
                        </Badge>
                      ))}
                      {r.input.options.map((o, i) => (
                        <Badge key={i} variant={i === r.input!.correctIndex ? "default" : "outline"}>
                          {o.text}
                        </Badge>
                      ))}
                      {r.imageKey && <Badge variant="outline">🖼 imagen</Badge>}
                    </div>
                  )}
                  {r.errors.map((e) => (
                    <p key={e} className="text-destructive">
                      {e}
                    </p>
                  ))}
                  {r.warnings.map((w) => (
                    <p key={w} className="text-warning-foreground dark:text-warning">
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
