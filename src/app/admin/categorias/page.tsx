import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { listCategoriesWithStats } from "@/server/categories/service";
import { PageHeader, EmptyState } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Categorías" };

export default async function CategoriesAdminPage() {
  await requirePermission("category.manage");
  const categories = await listCategoriesWithStats();
  return (
    <>
      <PageHeader
        title="Categorías"
        description="Temas de la liga. Cada una publica sus propios cuestionarios y tiene su tabla."
        actions={
          <Button asChild>
            <Link href="/admin/categorias/nueva">
              <Plus /> Nueva categoría
            </Link>
          </Button>
        }
      />
      {categories.length === 0 ? (
        <EmptyState title="Todavía no hay categorías" description="Creá la primera para empezar a cargar preguntas." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Preguntas</TableHead>
                <TableHead className="text-right">Cuestionarios</TableHead>
                <TableHead className="text-right">Inscriptos</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/admin/categorias/${c.id}`} className="font-medium hover:underline">
                      <span aria-hidden className="mr-1.5">
                        {c.icon}
                      </span>
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">/{c.slug}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.questions}</TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.quizzes}</TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.memberships}</TableCell>
                  <TableCell>{c.active ? <Badge>Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
