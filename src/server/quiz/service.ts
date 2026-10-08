import { z } from "zod";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { getCategorySettings, getSettings } from "@/server/config/service";
import { UserError, NotFoundError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { recalculateQuizAttempts } from "@/server/game/engine";
import { recomputeForQuiz } from "@/server/ranking/service";
import { getQuizStatus, validateQuizTiming } from "./status";

const DAY = 86_400_000;

export const quizInput = z
  .object({
    title: z.string().trim().min(2, "Poné un título.").max(120),
    description: z.string().trim().max(1000).optional(),
    categoryId: z.string().optional(),
    tournamentId: z.string().optional(),
    opensAt: z.coerce.date({ error: "Fecha inválida." }),
    closesAt: z.coerce.date({ error: "Fecha inválida." }),
    expiresAt: z.coerce.date({ error: "Fecha inválida." }),
    timeMode: z.enum(["PER_QUESTION", "TOTAL"]),
    timeLimitSec: z.coerce.number().int().min(3, "Mínimo 3 segundos.").max(3600),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    scoring: z.object({
      base: z.coerce.number().int().min(0).max(10000),
      timeBonus: z.coerce.number().int().min(0).max(10000),
      wrongPenalty: z.coerce.number().int().min(0).max(10000),
    }),
  })
  .refine((q) => Boolean(q.categoryId) !== Boolean(q.tournamentId), {
    path: ["categoryId"],
    message: "El cuestionario debe ser de una categoría (liga) o de un torneo.",
  });

export type QuizInput = z.infer<typeof quizInput>;

/** Valores sugeridos para un cuestionario nuevo de una categoría: próximo hueco según la frecuencia. */
export async function suggestQuizDefaults(categoryId: string | null, now = new Date()) {
  const s = categoryId
    ? await getCategorySettings(await prisma.category.findUniqueOrThrow({ where: { id: categoryId } }))
    : await getSettings();
  const last = categoryId
    ? await prisma.quiz.findFirst({ where: { categoryId, tournamentId: null }, orderBy: { opensAt: "desc" } })
    : null;
  let opensAt = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000); // próxima hora en punto
  if (last) {
    const next = new Date(last.opensAt.getTime() + s["quiz.frequencyDays"] * DAY);
    if (next > opensAt) opensAt = next;
  }
  const closesAt = new Date(opensAt.getTime() + s["quiz.activeDays"] * DAY);
  return {
    opensAt,
    closesAt,
    expiresAt: new Date(closesAt.getTime() + s["quiz.computableDays"] * DAY),
    timeLimitSec: s["quiz.timeLimitSec"],
    questionCount: s["quiz.questionCount"],
    scoring: { base: s["scoring.base"], timeBonus: s["scoring.timeBonus"], wrongPenalty: s["scoring.wrongPenalty"] },
  };
}

async function assertTiming(input: Pick<QuizInput, "opensAt" | "closesAt" | "expiresAt" | "tournamentId">) {
  const tournament = input.tournamentId ? await prisma.tournament.findUnique({ where: { id: input.tournamentId } }) : null;
  if (input.tournamentId && !tournament) throw new NotFoundError("Torneo");
  const errors = validateQuizTiming(input, tournament ?? undefined);
  if (errors.length) throw new UserError(errors.join(" "));
}

export async function createQuiz(raw: unknown, actor: { id: string }) {
  const input = quizInput.parse(raw);
  await assertTiming(input);
  const quiz = await prisma.quiz.create({
    data: { ...input, description: input.description || null, scoring: input.scoring, createdById: actor.id },
  });
  await logAudit({ actorId: actor.id, action: "quiz.create", entityType: "Quiz", entityId: quiz.id });
  return quiz;
}

export async function updateQuiz(id: string, raw: unknown, actor: { id: string }, now = new Date()) {
  const input = quizInput.parse(raw);
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) throw new NotFoundError("Cuestionario");
  const status = getQuizStatus(quiz, now);
  let data: Prisma.QuizUpdateInput;
  if (status === "DRAFT" || status === "SCHEDULED") {
    await assertTiming(input);
    data = {
      ...input,
      description: input.description || null,
      category: input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true },
      tournament: input.tournamentId ? { connect: { id: input.tournamentId } } : { disconnect: true },
    };
    delete (data as Record<string, unknown>).categoryId;
    delete (data as Record<string, unknown>).tournamentId;
    // Un programado no puede adelantarse a "ya abierto" ni cambiar el puntaje congelado sin despublicar
    if (status === "SCHEDULED") {
      if (input.opensAt <= now) throw new UserError("Un cuestionario programado no puede abrir en el pasado.");
      delete (data as Record<string, unknown>).scoring;
    }
  } else {
    // Ya abrió: solo se pueden mover el cierre y el fin del período computable (siempre con cierre definido).
    await assertTiming({ ...input, opensAt: quiz.opensAt, tournamentId: quiz.tournamentId ?? undefined });
    data = { title: input.title, description: input.description || null, closesAt: input.closesAt, expiresAt: input.expiresAt };
  }
  await prisma.quiz.update({ where: { id }, data });
  await logAudit({ actorId: actor.id, action: "quiz.update", entityType: "Quiz", entityId: id, before: quiz });
}

export async function setQuizQuestions(id: string, questionIds: string[], actor: { id: string }, now = new Date()) {
  const quiz = await prisma.quiz.findUnique({ where: { id }, include: { questions: true } });
  if (!quiz) throw new NotFoundError("Cuestionario");
  if (getQuizStatus(quiz, now) !== "DRAFT") throw new UserError("Solo se pueden cambiar las preguntas de un borrador.");
  const unique = [...new Set(questionIds)];
  const keep = new Map(quiz.questions.map((q) => [q.questionId, q]));
  await prisma.$transaction([
    prisma.quizQuestion.deleteMany({ where: { quizId: id, questionId: { notIn: unique } } }),
    ...unique.map((questionId, position) =>
      keep.has(questionId)
        ? prisma.quizQuestion.update({ where: { id: keep.get(questionId)!.id }, data: { position } })
        : prisma.quizQuestion.create({ data: { quizId: id, questionId, position } }),
    ),
  ]);
  await logAudit({ actorId: actor.id, action: "quiz.questions", entityType: "Quiz", entityId: id, meta: { count: unique.length } });
}

export async function publishQuiz(id: string, actor: { id: string }, now = new Date()) {
  const quiz = await prisma.quiz.findUnique({ where: { id }, include: { questions: { include: { question: true } }, tournament: true } });
  if (!quiz) throw new NotFoundError("Cuestionario");
  if (quiz.publishedAt) throw new UserError("Ya está publicado.");
  if (!quiz.questions.length) throw new UserError("Agregá preguntas antes de publicar.");
  const notApproved = quiz.questions.filter((q) => q.question.status !== "APPROVED");
  if (notApproved.length) throw new UserError(`Hay ${notApproved.length} pregunta(s) sin aprobar. Solo se publican preguntas aprobadas.`);
  if (quiz.closesAt <= now) throw new UserError("La fecha de cierre ya pasó.");
  const errors = validateQuizTiming(quiz, quiz.tournament ?? undefined);
  if (errors.length) throw new UserError(errors.join(" "));
  await prisma.quiz.update({ where: { id }, data: { publishedAt: now, status: getQuizStatus({ ...quiz, publishedAt: now }, now) } });
  await logAudit({ actorId: actor.id, action: "quiz.publish", entityType: "Quiz", entityId: id, meta: { scoring: quiz.scoring } });
}

export async function unpublishQuiz(id: string, actor: { id: string }, now = new Date()) {
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) throw new NotFoundError("Cuestionario");
  if (getQuizStatus(quiz, now) !== "SCHEDULED") throw new UserError("Solo se puede despublicar un cuestionario que todavía no abrió.");
  await prisma.quiz.update({ where: { id }, data: { publishedAt: null, status: "DRAFT" } });
  await logAudit({ actorId: actor.id, action: "quiz.unpublish", entityType: "Quiz", entityId: id });
}

/** Copia parámetros y preguntas a un borrador nuevo, con fechas en el próximo hueco. */
export async function copyQuiz(id: string, actor: { id: string }) {
  const src = await prisma.quiz.findUnique({ where: { id }, include: { questions: { orderBy: { position: "asc" } } } });
  if (!src) throw new NotFoundError("Cuestionario");
  const d = await suggestQuizDefaults(src.categoryId);
  let timing = { opensAt: d.opensAt, closesAt: d.closesAt, expiresAt: d.expiresAt };
  if (src.tournamentId) {
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: src.tournamentId } });
    timing = { opensAt: src.opensAt, closesAt: src.closesAt, expiresAt: t.endsAt };
  }
  const copy = await prisma.quiz.create({
    data: {
      title: `${src.title} (copia)`,
      description: src.description,
      categoryId: src.categoryId,
      tournamentId: src.tournamentId,
      ...timing,
      timeMode: src.timeMode,
      timeLimitSec: src.timeLimitSec,
      shuffleQuestions: src.shuffleQuestions,
      shuffleOptions: src.shuffleOptions,
      scoring: src.scoring as Prisma.InputJsonValue,
      copiedFromId: src.id,
      createdById: actor.id,
      questions: {
        create: src.questions.map((q) => ({ questionId: q.questionId, position: q.position, shuffleOptions: q.shuffleOptions })),
      },
    },
  });
  await logAudit({ actorId: actor.id, action: "quiz.copy", entityType: "Quiz", entityId: copy.id, meta: { from: id } });
  return copy;
}

export async function deleteDraftQuiz(id: string, actor: { id: string }) {
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) throw new NotFoundError("Cuestionario");
  if (quiz.publishedAt) throw new UserError("Solo se pueden eliminar borradores.");
  await prisma.quiz.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "quiz.delete", entityType: "Quiz", entityId: id, before: quiz });
}

export async function setQuizQuestionShuffle(quizQuestionId: string, value: boolean | null, actor: { id: string }) {
  const qq = await prisma.quizQuestion.update({ where: { id: quizQuestionId }, data: { shuffleOptions: value } });
  await logAudit({ actorId: actor.id, action: "quiz.questionShuffle", entityType: "Quiz", entityId: qq.quizId, meta: { quizQuestionId, value } });
}

/** Anula (o restaura) una pregunta del cuestionario y recalcula puntajes y tablas. */
export async function setQuestionVoided(quizQuestionId: string, voided: boolean, actor: { id: string }) {
  const qq = await prisma.quizQuestion.update({ where: { id: quizQuestionId }, data: { voided }, include: { quiz: true } });
  const n = await recalculateQuizAttempts(qq.quizId);
  await recomputeForQuiz(qq.quiz);
  await logAudit({
    actorId: actor.id,
    action: voided ? "quiz.voidQuestion" : "quiz.unvoidQuestion",
    entityType: "Quiz",
    entityId: qq.quizId,
    meta: { quizQuestionId, recalculated: n },
  });
  return n;
}

/**
 * Corrige la respuesta correcta de una pregunta (aunque esté bloqueada: es la excepción para errores)
 * y recalcula todos los cuestionarios que la usan.
 */
export async function changeCorrectOption(questionId: string, optionId: string, actor: { id: string }) {
  const options = await prisma.questionOption.findMany({ where: { questionId } });
  const before = options.find((o) => o.isCorrect)?.id;
  if (!options.some((o) => o.id === optionId)) throw new UserError("La opción no pertenece a la pregunta.");
  await prisma.$transaction([
    prisma.questionOption.updateMany({ where: { questionId }, data: { isCorrect: false } }),
    prisma.questionOption.update({ where: { id: optionId }, data: { isCorrect: true } }),
  ]);
  const quizzes = await prisma.quiz.findMany({ where: { questions: { some: { questionId } }, publishedAt: { not: null } } });
  let total = 0;
  for (const q of quizzes) {
    total += await recalculateQuizAttempts(q.id);
    await recomputeForQuiz(q);
  }
  await logAudit({
    actorId: actor.id,
    action: "question.changeCorrect",
    entityType: "Question",
    entityId: questionId,
    before: { correct: before },
    after: { correct: optionId },
    meta: { quizzes: quizzes.map((q) => q.id), recalculated: total },
  });
  return { quizzes: quizzes.length, attempts: total };
}

export async function recalculateQuiz(id: string, actor: { id: string }) {
  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id } });
  const n = await recalculateQuizAttempts(id);
  await recomputeForQuiz(quiz);
  await logAudit({ actorId: actor.id, action: "quiz.recalculate", entityType: "Quiz", entityId: id, meta: { attempts: n } });
  return n;
}
