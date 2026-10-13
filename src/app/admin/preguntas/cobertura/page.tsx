import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { listBankCoverage } from "@/server/autoquiz/service";
import { EmptyState, PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageBadge, CoverageView } from "./coverage-view";

export const metadata = { title: "Cobertura del banco" };

const ORDER = { CRITICAL: 0, WARNING: 1, OK: 2 } as const;

export default async function CoveragePage() {
  const user = await requirePermission("question.create");
  const list = (await listBankCoverage()).sort((a, b) => ORDER[a.coverage.level] - ORDER[b.coverage.level]);
  return (
    <>
      <PageHeader
        title="Cobertura del banco"
        description="Para cada categoría con calendario automático: si las preguntas nunca usadas alcanzan para los próximos turnos. Cuando no alcanzan se avisa a admins y mods."
        back={{ href: "/admin/preguntas", label: "Preguntas" }}
      />
      {list.length === 0 ? (
        <EmptyState
          title="Ninguna categoría tiene calendario automático"
          description="Configuralo en la página de cada categoría (sección Calendario automático)."
        />
      ) : (
        <div className="grid gap-4">
          {list.map((c) => (
            <Card key={c.categoryId}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Link href={`/admin/categorias/${c.categoryId}`} className="hover:underline">
                    {c.categoryName}
                  </Link>
                  <CoverageBadge level={c.coverage.level} />
                  <span className="text-muted-foreground text-xs font-normal">
                    {c.perQuiz} preguntas por cuestionario ·{" "}
                    {c.upcoming.filter((u) => u.status !== "excluded" && u.status !== "skipped").length} turnos en los próximos
                    días
                    {c.upcoming.some((u) => u.urgent) && (
                      <span className="text-destructive">
                        {" "}
                        · {c.upcoming.filter((u) => u.urgent).length} sin cuestionario a punto de abrir
                      </span>
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CoverageView c={c} tz={user.timezone} showSlots={false} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
