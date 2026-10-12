import type { QuestionSearch } from "@/server/questions/service";
import type { ReviewStatus } from "@/generated/prisma/enums";
import { parsePage, str } from "@/components/common";

type SP = Record<string, string | string[] | undefined>;

const STATUSES = new Set<string>(["PENDING_REVIEW", "APPROVED", "REJECTED"]);

/** Filtros del listado de preguntas a partir de la query (los usa la página y la aprobación masiva). */
export function parseQuestionFilters(sp: SP): QuestionSearch {
  const unusedRaw = str(sp.unused);
  const status = str(sp.status);
  const difficulty = Number(str(sp.difficulty));
  return {
    q: str(sp.q),
    categoryId: str(sp.category),
    tag: str(sp.tag),
    difficulty: difficulty >= 1 && difficulty <= 5 ? difficulty : undefined,
    status: status && STATUSES.has(status) ? (status as ReviewStatus) : undefined,
    unused: unusedRaw === "never" ? "never" : unusedRaw && Number(unusedRaw) > 0 ? Number(unusedRaw) : undefined,
    includeArchived: sp.archived === "1",
    page: parsePage(sp.page),
  };
}
