import { prisma, type Db } from "@/server/db";
import type { Prisma, ReviewStatus } from "@/generated/prisma/client";
import { normalizeText } from "@/lib/text";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { getSettings } from "@/server/config/service";
import { questionInput, type QuestionInput } from "./schema";

const DAY = 86_400_000;

export const questionInclude = {
  options: { orderBy: { position: "asc" } },
  categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
  tags: { include: { tag: true } },
  author: { select: { id: true, name: true, username: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.QuestionInclude;

export type QuestionWithRelations = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

async function upsertTags(names: string[], db: Db) {
  const unique = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const tags = [];
  for (const name of unique) tags.push(await db.tag.upsert({ where: { name }, create: { name }, update: {} }));
  return tags;
}

function contentData(input: QuestionInput) {
  return {
    type: input.type,
    text: input.text ?? null,
    normalizedText: normalizeText(input.text),
    imageKey: input.imageKey ?? null,
    difficulty: input.difficulty,
    explanation: input.explanation ?? null,
    source: input.source ?? null,
    shuffleOptions: input.shuffleOptions,
  };
}

function optionsData(input: QuestionInput) {
  return input.options.map((o, i) => ({
    position: i,
    text: o.text ?? null,
    imageKey: o.imageKey ?? null,
    isCorrect: i === input.correctIndex,
  }));
}

export async function createQuestion(
  raw: unknown,
  actor: { id: string },
  opts: { approve?: boolean; parentId?: string; version?: number } = {},
  db: Db = prisma,
) {
  const input = questionInput.parse(raw);
  const tags = await upsertTags(input.tags, db);
  const status: ReviewStatus = opts.approve ? "APPROVED" : "PENDING_REVIEW";
  const q = await db.question.create({
    data: {
      ...contentData(input),
      status,
      reviewedById: opts.approve ? actor.id : null,
      reviewedAt: opts.approve ? new Date() : null,
      authorId: actor.id,
      parentId: opts.parentId,
      version: opts.version ?? 1,
      options: { create: optionsData(input) },
      categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      tags: { create: tags.map((t) => ({ tagId: t.id })) },
    },
  });
  await logAudit({ actorId: actor.id, action: "question.create", entityType: "Question", entityId: q.id, meta: { status } }, db);
  return q;
}

/**
 * Una pregunta queda bloqueada para edición cuando está en un cuestionario publicado que ya abrió
 * (hay o pudo haber intentos). En ese caso se crea una versión nueva.
 */
export async function isQuestionLocked(questionId: string, now = new Date(), db: Db = prisma) {
  const used = await db.quizQuestion.findFirst({
    where: { questionId, quiz: { publishedAt: { not: null }, opensAt: { lte: now } } },
    select: { id: true },
  });
  return Boolean(used);
}

export async function updateQuestion(id: string, raw: unknown, actor: { id: string }, db: Db = prisma) {
  const input = questionInput.parse(raw);
  const before = await db.question.findUnique({ where: { id }, include: { options: true } });
  if (!before) throw new NotFoundError("Pregunta");
  if (await isQuestionLocked(id, new Date(), db))
    throw new UserError("Esta pregunta ya se usó en un cuestionario que abrió: guardala como versión nueva.", "LOCKED");
  const tags = await upsertTags(input.tags, db);
  const run = async (tx: Db) => {
    await tx.questionOption.deleteMany({ where: { questionId: id } });
    await tx.questionCategory.deleteMany({ where: { questionId: id } });
    await tx.questionTag.deleteMany({ where: { questionId: id } });
    await tx.question.update({
      where: { id },
      data: {
        ...contentData(input),
        options: { create: optionsData(input) },
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { create: tags.map((t) => ({ tagId: t.id })) },
      },
    });
  };
  if ("$transaction" in db) await db.$transaction(run);
  else await run(db);
  await logAudit({ actorId: actor.id, action: "question.update", entityType: "Question", entityId: id, before }, db);
}

/** Crea una versión nueva (la anterior queda archivada pero intacta para los cuestionarios que la usaron). */
export async function createQuestionVersion(id: string, raw: unknown, actor: { id: string }, approve: boolean, db: Db = prisma) {
  const prev = await db.question.findUnique({ where: { id } });
  if (!prev) throw new NotFoundError("Pregunta");
  const q = await createQuestion(raw, actor, { approve, parentId: id, version: prev.version + 1 }, db);
  await db.question.update({ where: { id }, data: { archived: true } });
  await logAudit({ actorId: actor.id, action: "question.version", entityType: "Question", entityId: q.id, meta: { from: id } }, db);
  return q;
}

export async function duplicateQuestion(id: string, actor: { id: string }, db: Db = prisma) {
  const q = await db.question.findUnique({ where: { id }, include: questionInclude });
  if (!q) throw new NotFoundError("Pregunta");
  return createQuestion(toInput(q), actor, {}, db);
}

export async function reviewQuestion(
  id: string,
  decision: "APPROVED" | "REJECTED" | "PENDING_REVIEW",
  comment: string | undefined,
  actor: { id: string },
  db: Db = prisma,
) {
  if (decision === "REJECTED" && !comment?.trim()) throw new UserError("Indicá un comentario al rechazar.");
  const q = await db.question.update({
    where: { id },
    data: { status: decision, reviewComment: comment?.trim() || null, reviewedById: actor.id, reviewedAt: new Date() },
  });
  await logAudit(
    { actorId: actor.id, action: `question.review`, entityType: "Question", entityId: id, after: { status: decision, comment } },
    db,
  );
  return q;
}

export async function setArchived(id: string, archived: boolean, actor: { id: string }, db: Db = prisma) {
  await db.question.update({ where: { id }, data: { archived } });
  await logAudit({ actorId: actor.id, action: archived ? "question.archive" : "question.unarchive", entityType: "Question", entityId: id }, db);
}

/** Convierte una pregunta guardada al formato del editor. */
export function toInput(q: QuestionWithRelations): QuestionInput {
  return {
    type: q.type,
    text: q.text ?? undefined,
    imageKey: q.imageKey ?? undefined,
    difficulty: q.difficulty,
    explanation: q.explanation ?? undefined,
    source: q.source ?? undefined,
    categoryIds: q.categories.map((c) => c.categoryId),
    tags: q.tags.map((t) => t.tag.name),
    shuffleOptions: q.shuffleOptions,
    options: q.options.map((o) => ({ text: o.text ?? undefined, imageKey: o.imageKey ?? undefined })),
    correctIndex: Math.max(0, q.options.findIndex((o) => o.isCorrect)),
  };
}

// ───────────────────────── Duplicados ─────────────────────────

export type DuplicateCandidate = { id: string; text: string | null; similarity: number; status: ReviewStatus };

/** Preguntas con texto parecido (pg_trgm). */
export async function findSimilarQuestions(text: string, opts: { excludeId?: string; limit?: number } = {}, db: Db = prisma) {
  const norm = normalizeText(text);
  if (norm.length < 8) return [];
  const threshold = (await getSettings(db))["questions.duplicateThreshold"];
  return db.$queryRaw<DuplicateCandidate[]>`
    SELECT id, text, status, similarity("normalizedText", ${norm})::float AS similarity
    FROM "Question"
    WHERE "normalizedText" % ${norm}
      AND similarity("normalizedText", ${norm}) >= ${threshold}
      AND (${opts.excludeId ?? null}::text IS NULL OR id <> ${opts.excludeId ?? null})
      AND archived = false
    ORDER BY similarity DESC
    LIMIT ${opts.limit ?? 5}`;
}

// ───────────────────────── Buscador ─────────────────────────

export type QuestionSearch = {
  q?: string;
  categoryId?: string;
  tag?: string;
  difficulty?: number;
  status?: ReviewStatus;
  /** "never" = nunca usada; número = no usada en los últimos N días. */
  unused?: "never" | number;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export function buildQuestionWhere(f: QuestionSearch, now = new Date()): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = {};
  const and: Prisma.QuestionWhereInput[] = [];
  if (!f.includeArchived) where.archived = false;
  if (f.q?.trim()) {
    const words = normalizeText(f.q).split(" ").filter(Boolean);
    for (const w of words) and.push({ normalizedText: { contains: w } });
  }
  if (f.categoryId) where.categories = { some: { categoryId: f.categoryId } };
  if (f.tag) where.tags = { some: { tag: { name: f.tag.toLowerCase() } } };
  if (f.difficulty) where.difficulty = f.difficulty;
  if (f.status) where.status = f.status;
  if (f.unused === "never") where.quizQuestions = { none: {} };
  else if (typeof f.unused === "number")
    where.quizQuestions = { none: { quiz: { opensAt: { gte: new Date(now.getTime() - f.unused * DAY) } } } };
  if (and.length) where.AND = and;
  return where;
}

export async function searchQuestions(f: QuestionSearch, db: Db = prisma) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, f.pageSize ?? 20);
  const where = buildQuestionWhere(f);
  const [total, items] = await Promise.all([
    db.question.count({ where }),
    db.question.findMany({
      where,
      include: {
        ...questionInclude,
        quizQuestions: {
          include: { quiz: { select: { id: true, title: true, opensAt: true, publishedAt: true } } },
          orderBy: { quiz: { opensAt: "desc" } },
          take: 5,
        },
        _count: { select: { quizQuestions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), items };
}
