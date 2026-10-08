import { authorize } from "@/server/auth/guard";
import { buildTemplate } from "@/server/import/excel";
import { prisma } from "@/server/db";
import { apiError } from "@/server/api";

export async function GET() {
  try {
    await authorize("question.import");
    const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { name: true } });
    const buf = await buildTemplate(categories);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="plantilla-preguntas-pyr.xlsx"',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
