import Link from "next/link";
import { Download } from "lucide-react";
import { requirePermission, userCan } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Importar preguntas" };

const STATUS = { PREVIEW: "Sin confirmar", COMMITTED: "Importada", DISCARDED: "Descartada" } as const;

export default async function ImportPage() {
  const user = await requirePermission("question.import");
  const [canApprove, recent] = await Promise.all([
    userCan(user, "question.autoApprove"),
    prisma.importJob.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, fileName: true, status: true, validCount: true, invalidCount: true, createdCount: true, createdAt: true },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Importar preguntas desde Excel"
        description="Subí la plantilla completa. Vas a ver una previsualización con los errores de cada fila antes de confirmar."
        back={{ href: "/admin/preguntas", label: "Preguntas" }}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Descargá la plantilla</CardTitle>
            <CardDescription>
              Incluye una fila de ejemplo, validaciones y una hoja de instrucciones con las categorías disponibles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/api/import/template">
                <Download /> Descargar plantilla .xlsx
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Subí el archivo</CardTitle>
            <CardDescription>Opcional: un .zip con las imágenes referenciadas por nombre en la columna “Imagen”.</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadForm canApprove={canApprove} />
          </CardContent>
        </Card>
      </div>
      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Tus importaciones recientes</h2>
          <ul className="grid gap-2 text-sm">
            {recent.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <Link href={`/admin/importar/${j.id}`} className="font-medium hover:underline">
                  {j.fileName}
                </Link>
                <span className="text-muted-foreground">
                  {STATUS[j.status]} · {j.validCount} válidas / {j.invalidCount} con errores
                  {j.status === "COMMITTED" && ` · ${j.createdCount} creadas`} · {formatDateTime(j.createdAt, user.timezone)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
