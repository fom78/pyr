import { notFound } from "next/navigation";
import { requirePermission, userCan } from "@/server/auth/session";
import { getCategorySettings, getSettings } from "@/server/config/service";
import { prisma } from "@/server/db";
import { fileUrl } from "@/server/storage";
import { bankCoverage } from "@/server/autoquiz/service";
import { PageHeader } from "@/components/common";
import { CategoryForm } from "../category-form";
import { overrideFields } from "../overrides";
import { CoverageBadge, CoverageView } from "../../preguntas/cobertura/coverage-view";
import { ScheduleForm } from "./schedule-form";

export const metadata = { title: "Editar categoría" };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("category.manage");
  const { id } = await params;
  const [category, s, canSchedule] = await Promise.all([
    prisma.category.findUnique({ where: { id }, include: { schedule: true } }),
    getSettings(),
    userCan(user, "schedule.manage"),
  ]);
  if (!category) notFound();
  const { schedule, ...rest } = category;
  const catSettings = await getCategorySettings(category);
  const coverage = schedule ? await bankCoverage({ ...schedule, category: rest }) : null;
  return (
    <>
      <PageHeader title={`${category.icon ?? ""} ${category.name}`} back={{ href: "/admin/categorias", label: "Categorías" }} />
      <div className="grid gap-6">
        <CategoryForm
          id={category.id}
          overrides={overrideFields(s)}
          initial={{
            ...rest,
            imageUrl: fileUrl(category.imageKey),
            settings: (category.settings ?? {}) as Record<string, unknown>,
          }}
        />
        {canSchedule && (
          <ScheduleForm
            categoryId={category.id}
            questionCount={catSettings["quiz.questionCount"]}
            initial={
              schedule && {
                enabled: schedule.enabled,
                weekdays: schedule.weekdays,
                timeOfDay: schedule.timeOfDay,
                titleTemplate: schedule.titleTemplate,
                difficultyMix: schedule.difficultyMix as Record<string, number> | null,
                timeMode: schedule.timeMode,
              }
            }
          >
            {coverage && (
              <section className="grid gap-3 border-t pt-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  Próximos turnos y banco de preguntas <CoverageBadge level={coverage.coverage.level} />
                </h3>
                <CoverageView c={coverage} tz={user.timezone} />
              </section>
            )}
          </ScheduleForm>
        )}
      </div>
    </>
  );
}
