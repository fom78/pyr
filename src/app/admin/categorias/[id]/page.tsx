import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { prisma } from "@/server/db";
import { fileUrl } from "@/server/storage";
import { PageHeader } from "@/components/common";
import { CategoryForm } from "../category-form";
import { overrideFields } from "../overrides";

export const metadata = { title: "Editar categoría" };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("category.manage");
  const { id } = await params;
  const [category, s] = await Promise.all([prisma.category.findUnique({ where: { id } }), getSettings()]);
  if (!category) notFound();
  return (
    <>
      <PageHeader title={`${category.icon ?? ""} ${category.name}`} back={{ href: "/admin/categorias", label: "Categorías" }} />
      <CategoryForm
        id={category.id}
        overrides={overrideFields(s)}
        initial={{
          ...category,
          imageUrl: fileUrl(category.imageKey),
          settings: (category.settings ?? {}) as Record<string, unknown>,
        }}
      />
    </>
  );
}
