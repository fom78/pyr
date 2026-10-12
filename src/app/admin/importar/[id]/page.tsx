import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ExternalLink, TriangleAlert, XCircle } from "lucide-react";
import { requirePermission, userCan } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { defaultDecision, type RowDecision, type StoredRow } from "@/server/import/excel";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { commitImportAction, discardImportAction } from "./actions";
import { DecisionRow, DecisionSelect, ImportDecisions } from "./import-decisions";
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
  const committed = job.status === "COMMITTED";
  const similarCount = rows.filter((r) => !r.errors.length && r.similar?.length).length;
  const canApprove = await userCan(user, "question.autoApprove");
  const validRows = rows.filter((r) => !r.errors.length && r.input);
  const defaults: Record<number, RowDecision> = Object.fromEntries(
    validRows.map((r) => [r.row, defaultDecision(r, job.autoApprove && canApprove)]),
  );
  const created = rows.filter((r) => r.createdId);
  // Importaciones viejas guardaban "import" (= según la casilla de la subida).
  const wasApproved = (r: StoredRow) => r.decision === "approve" || ((r.decision as string) === "import" && job.autoApprove);

  const wrapList = (list: React.ReactNode) =>
    pending ? (
      <ImportDecisions
        rows={validRows.map((r) => ({ row: r.row, similar: !!r.similar?.length }))}
        defaults={defaults}
        canApprove={canApprove}
        invalidCount={job.invalidCount}
        commitAction={commitImportAction.bind(null, job.id)}
        discardAction={discardImportAction.bind(null, job.id)}
      >
        {list}
      </ImportDecisions>
    ) : (
      list
    );

  return (
    <>
      <PageHeader
        title={job.fileName}
        description={
          job.status === "COMMITTED"
            ? `Importación confirmada: se crearon ${job.createdCount} preguntas (${created.filter(wasApproved).length} aprobadas, ${created.filter((r) => !wasApproved(r)).length} pendientes)${rows.some((r) => r.decision === "skip") ? ` · ${rows.filter((r) => r.decision === "skip").length} no importadas` : ""}.`
            : job.status === "DISCARDED"
              ? "Importación descartada."
              : `${job.validCount} filas válidas · ${job.invalidCount} con errores${similarCount ? ` · ${similarCount} parecidas a preguntas existentes` : ""}. Elegí qué hacer con cada una (o por grupo) y confirmá.`
        }
        back={{ href: "/admin/importar", label: "Importar" }}
      />
      {error && <p className="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">{error}</p>}
      {wrapList(
        <ul className="grid gap-2">
          {rows.map((r) => {
            const ok = r.errors.length === 0;
            return (
              <DecisionRow
                key={r.row}
                row={r.row}
                className={cn("rounded-lg border p-3 text-sm", !ok && "border-destructive/50 bg-destructive/5")}
              >
                <div className="flex items-start gap-2">
                  {ok ? (
                    r.warnings.length ? (
                      <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-label="Válida con advertencias" />
                    ) : (
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-label="Válida" />
                    )
                  ) : (
                    <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-label="Con errores" />
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
                    {r.similar && r.similar.length > 0 && (
                      <ul className="grid gap-0.5">
                        {r.similar.map((sim) => (
                          <li key={sim.id}>
                            <Link
                              href={`/admin/preguntas/${sim.id}`}
                              target="_blank"
                              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 hover:underline"
                            >
                              <span className="tabular-nums">{Math.round(sim.similarity * 100)}%</span>
                              <span className="line-clamp-1">{sim.text || "(sin texto)"}</span>
                              <ExternalLink className="size-3 shrink-0" aria-hidden />
                              <span className="sr-only">(abre en otra pestaña)</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {committed && ok && (
                      <p className="text-xs">
                        {r.createdId ? (
                          <Link href={`/admin/preguntas/${r.createdId}`} className="font-medium hover:underline">
                            {wasApproved(r) ? "Importada aprobada" : "Importada como pendiente"} · ver pregunta
                          </Link>
                        ) : r.decision === "skip" ? (
                          <span className="text-muted-foreground">No importada</span>
                        ) : null}
                      </p>
                    )}
                  </div>
                  {pending && ok && r.input && <DecisionSelect row={r.row} />}
                </div>
              </DecisionRow>
            );
          })}
        </ul>,
      )}
    </>
  );
}
