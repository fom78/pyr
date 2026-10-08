import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { PageHeader } from "@/components/common";
import { CategoryForm } from "../category-form";
import { overrideFields } from "../overrides";

export const metadata = { title: "Nueva categoría" };

export default async function NewCategoryPage() {
  await requirePermission("category.manage");
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Nueva categoría" back={{ href: "/admin/categorias", label: "Categorías" }} />
      <CategoryForm id={null} overrides={overrideFields(s)} />
    </>
  );
}
