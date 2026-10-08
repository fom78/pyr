/**
 * Seed:
 *  - Siempre: crea/actualiza el admin desde variables de entorno (ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL)
 *    y los textos de reglas por defecto.
 *  - Si SEED_DEMO != "false" y la base no tiene categorías: datos de prueba (usuarios de cada rol, categorías,
 *    preguntas, cuestionarios en todos los estados, intentos, tablas, un torneo y un baneo).
 * Uso: npm run db:seed
 */
import "dotenv/config";
import { randomInt } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/server/db";
import { grantSignupBonus } from "../src/server/credits/rewards";
import { postTransaction } from "../src/server/credits/service";
import { recomputeAllStandings } from "../src/server/ranking/service";
import { scoreAnswer, totalize } from "../src/server/scoring/scoring";
import { getStrategy } from "../src/server/wildcards/strategies";
import { normalizeText } from "../src/lib/text";
import { defaultRulesTexts } from "../src/server/rules/defaults";
import type { Role, WildcardType } from "../src/generated/prisma/enums";
import { seedCategories } from "./seed-data";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = new Date();
const at = (ms: number) => new Date(now.getTime() + ms);
const SCORING = { base: 100, timeBonus: 50, wrongPenalty: 0 };

async function upsertUser(username: string, password: string, role: Role, name: string, email?: string) {
  const passwordHash = await hash(password);
  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      displayUsername: username,
      name,
      email: email || `${username}@sin-email.invalid`,
      role,
    },
    update: { role },
  });
  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (account) await prisma.account.update({ where: { id: account.id }, data: { password: passwordHash } });
  else await prisma.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash } });
  await grantSignupBonus(user.id);
  return user;
}

function pick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(randomInt(copy.length), 1)[0]);
  return out;
}

type QuizSpec = { title: string; opensAt: Date; closesAt: Date; expiresAt: Date; published: boolean };

async function createQuiz(
  spec: QuizSpec,
  questionIds: string[],
  ref: { categoryId?: string; tournamentId?: string },
  createdById: string,
) {
  return prisma.quiz.create({
    data: {
      title: spec.title,
      categoryId: ref.categoryId,
      tournamentId: ref.tournamentId,
      publishedAt: spec.published ? at(-60 * DAY) : null,
      opensAt: spec.opensAt,
      closesAt: spec.closesAt,
      expiresAt: spec.expiresAt,
      timeMode: "PER_QUESTION",
      timeLimitSec: 20,
      scoring: SCORING,
      createdById,
      questions: { create: questionIds.map((questionId, i) => ({ questionId, position: i })) },
    },
    include: { questions: { include: { question: { include: { options: true } } } } },
  });
}

/** Simula un intento terminado: skill = probabilidad de acertar. */
async function simulateAttempt(
  quiz: Awaited<ReturnType<typeof createQuiz>>,
  userId: string,
  skill: number,
  wildcard?: { entryId: string; type: WildcardType },
) {
  const limitMs = quiz.timeLimitSec * 1000;
  const order = quiz.questions.map((q) => q.id);
  const startedAt = new Date(Math.min(quiz.opensAt.getTime() + randomInt(1, 24) * HOUR, quiz.closesAt.getTime() - HOUR));
  const strategy = wildcard ? getStrategy(wildcard.type) : null;
  const wcState = strategy ? strategy.init({ questionCount: order.length, randomInt: (n) => randomInt(n) }) : {};
  let t = startedAt.getTime();
  const answers = quiz.questions.map((qq, index) => {
    const correct = qq.question.options.find((o) => o.isCorrect)!;
    const wrong = qq.question.options.filter((o) => !o.isCorrect);
    const isCorrect = Math.random() < skill;
    const timeMs = randomInt(1500, limitMs);
    const servedAt = new Date(t);
    t += timeMs + 500;
    const mult = strategy ? strategy.multipliers(index, wcState) : undefined;
    const s = scoreAnswer({ isCorrect, timeMs, limitMs }, SCORING, mult);
    return {
      quizQuestionId: qq.id,
      index,
      optionOrder: qq.question.options.map((o) => o.id),
      servedAt,
      deadlineAt: new Date(servedAt.getTime() + limitMs),
      answeredAt: new Date(servedAt.getTime() + timeMs),
      selectedOptionId: isCorrect ? correct.id : wrong[randomInt(wrong.length)].id,
      isCorrect,
      timeMs,
      ...s,
    };
  });
  const totals = totalize(answers);
  const score = strategy ? strategy.finalize(totals.score, wcState) : totals.score;
  const attempt = await prisma.attempt.create({
    data: {
      quizId: quiz.id,
      userId,
      status: "FINISHED",
      questionOrder: order,
      currentIndex: order.length,
      startedAt,
      deadlineAt: new Date(startedAt.getTime() + order.length * limitMs + 15_000),
      finishedAt: new Date(t),
      score,
      correctCount: totals.correctCount,
      totalTimeMs: totals.totalTimeMs,
      rewardsGiven: true,
      answers: { create: answers },
    },
  });
  if (wildcard) {
    await prisma.wildcardUse.create({
      data: { entryId: wildcard.entryId, attemptId: attempt.id, type: wildcard.type, state: wcState as object },
    });
  }
  return attempt;
}

async function seedDemo(adminId: string) {
  console.log("→ Datos de prueba");
  const mod = await upsertUser("moderador", "Moderador123!", "MOD", "Mora (mod)", "mod@example.com");
  const players = await Promise.all(
    [
      ["ana", "Ana"],
      ["beto", "Beto"],
      ["caro", "Caro"],
      ["dani", "Dani"],
      ["eli", "Eli"],
    ].map(([u, n]) => upsertUser(u, "Jugador123!", "USER", n)),
  );
  const [ana, beto, caro, dani, eli] = players;
  const skill: Record<string, number> = { [ana.id]: 0.85, [beto.id]: 0.7, [caro.id]: 0.6, [dani.id]: 0.5, [eli.id]: 0.65 };

  const tags = await Promise.all(["clásicos", "argentina", "historia"].map((name) => prisma.tag.create({ data: { name } })));

  const categories: Record<string, { id: string; questionIds: string[] }> = {};
  for (const c of seedCategories) {
    const category = await prisma.category.create({
      data: { slug: c.slug, name: c.name, icon: c.icon, description: c.description },
    });
    const questionIds: string[] = [];
    for (const [text, options, correct, difficulty] of c.questions) {
      const q = await prisma.question.create({
        data: {
          type: "TEXT",
          text,
          normalizedText: normalizeText(text),
          difficulty,
          status: "APPROVED",
          authorId: mod.id,
          reviewedById: adminId,
          reviewedAt: at(-90 * DAY),
          categories: { create: { categoryId: category.id } },
          tags: /argentin|xeneize|boca|soda|piazzolla|clan|simuladores/i.test(text)
            ? { create: { tagId: tags[1].id } }
            : undefined,
          options: { create: options.map((o, i) => ({ position: i, text: o, isCorrect: i === correct })) },
        },
      });
      questionIds.push(q.id);
    }
    categories[c.slug] = { id: category.id, questionIds };
  }

  // Preguntas pendientes de revisión
  for (const [text, options] of [
    ["¿Quién dirigió 'Relatos salvajes'?", ["Damián Szifron", "Juan José Campanella", "Lucrecia Martel", "Pablo Trapero"]],
    ["¿Qué película ganó el primer Oscar a Mejor Película?", ["Alas", "Amanecer", "Sin novedad en el frente", "Cimarrón"]],
  ] as const) {
    await prisma.question.create({
      data: {
        text,
        normalizedText: normalizeText(text),
        status: "PENDING_REVIEW",
        authorId: mod.id,
        categories: { create: { categoryId: categories.cine.id } },
        options: { create: options.map((o, i) => ({ position: i, text: o, isCorrect: i === 0 })) },
      },
    });
  }

  // Inscripciones (vidas)
  const memberships: [typeof ana, string[]][] = [
    [ana, ["futbol", "cine", "paises"]],
    [beto, ["futbol", "series"]],
    [caro, ["cine", "musica", "paises"]],
    [dani, ["futbol"]],
    [eli, ["futbol", "cine"]],
  ];
  for (const [u, slugs] of memberships)
    for (const slug of slugs)
      await prisma.categoryMembership.create({ data: { userId: u.id, categoryId: categories[slug].id, joinedAt: at(-60 * DAY) } });

  // Cuestionarios en todos los estados + intentos
  for (const c of seedCategories) {
    const { id: categoryId, questionIds } = categories[c.slug];
    const members = memberships.filter(([, s]) => s.includes(c.slug)).map(([u]) => u);
    const specs: (QuizSpec & { play: boolean })[] = [
      { title: `${c.name} #1`, opensAt: at(-45 * DAY), closesAt: at(-42 * DAY), expiresAt: at(-12 * DAY), published: true, play: true },
      { title: `${c.name} #2`, opensAt: at(-9 * DAY), closesAt: at(-6 * DAY), expiresAt: at(24 * DAY), published: true, play: true },
      { title: `${c.name} #3`, opensAt: at(-6 * DAY), closesAt: at(-3 * DAY), expiresAt: at(27 * DAY), published: true, play: true },
      { title: `${c.name} #4`, opensAt: at(-1 * DAY), closesAt: at(2 * DAY), expiresAt: at(32 * DAY), published: true, play: false },
      { title: `${c.name} #5`, opensAt: at(2 * DAY), closesAt: at(5 * DAY), expiresAt: at(35 * DAY), published: true, play: false },
      { title: `${c.name} #6 (borrador)`, opensAt: at(5 * DAY), closesAt: at(8 * DAY), expiresAt: at(38 * DAY), published: false, play: false },
    ];
    for (const spec of specs) {
      const quiz = await createQuiz(spec, pick(questionIds, 5), { categoryId }, mod.id);
      if (spec.play) for (const u of members) await simulateAttempt(quiz, u.id, skill[u.id]);
    }
  }

  // Torneo
  const tournament = await prisma.tournament.create({
    data: {
      slug: "copa-primavera",
      name: "Copa PyR de Primavera",
      description: "Torneo de fútbol y cine: 4 cuestionarios, se suman todos. ¡Usá bien tus comodines!",
      status: "PUBLISHED",
      startsAt: at(-3 * DAY),
      endsAt: at(20 * DAY),
      registrationOpensAt: at(-5 * DAY),
      registrationEndsAt: at(5 * DAY),
      quizCount: 4,
      frequencyDays: 5,
      entryCost: 30,
      maxParticipants: 100,
      wildcardsPerQuiz: 1,
      prizes: [
        { rank: 1, credits: 150 },
        { rank: 2, credits: 75 },
        { rank: 3, credits: 30 },
      ],
      createdById: adminId,
      categories: { create: [{ categoryId: categories.futbol.id }, { categoryId: categories.cine.id }] },
      wildcards: {
        create: [
          { type: "DOUBLE_TOTAL", quantity: 1 },
          { type: "DOUBLE_PER_CORRECT", quantity: 1 },
          { type: "TRIPLE_SURPRISE", quantity: 1 },
        ],
      },
    },
  });
  const tPool = [...categories.futbol.questionIds, ...categories.cine.questionIds];
  const tSpecs: QuizSpec[] = [
    { title: "Copa Primavera — Fecha 1", opensAt: at(-3 * DAY), closesAt: at(-1 * DAY), expiresAt: at(20 * DAY), published: true },
    { title: "Copa Primavera — Fecha 2", opensAt: at(-2 * HOUR), closesAt: at(2 * DAY), expiresAt: at(20 * DAY), published: true },
    { title: "Copa Primavera — Fecha 3", opensAt: at(7 * DAY), closesAt: at(9 * DAY), expiresAt: at(20 * DAY), published: true },
    { title: "Copa Primavera — Fecha 4", opensAt: at(12 * DAY), closesAt: at(14 * DAY), expiresAt: at(20 * DAY), published: false },
  ];
  const tQuizzes = [];
  for (const spec of tSpecs) tQuizzes.push(await createQuiz(spec, pick(tPool, 6), { tournamentId: tournament.id }, adminId));

  for (const u of [ana, beto, caro]) {
    const tx = await postTransaction({
      userId: u.id,
      amount: -tournament.entryCost,
      type: "TOURNAMENT_ENTRY",
      reason: `Inscripción: ${tournament.name}`,
      idempotencyKey: `entry:${tournament.id}:${u.id}`,
    });
    const entry = await prisma.tournamentEntry.create({ data: { tournamentId: tournament.id, userId: u.id, ledgerTxId: tx.id } });
    await simulateAttempt(tQuizzes[0], u.id, skill[u.id], u.id === ana.id ? { entryId: entry.id, type: "DOUBLE_PER_CORRECT" } : undefined);
  }

  // Un baneo temporal de ejemplo
  await prisma.ban.create({
    data: { userId: eli.id, reason: "Lenguaje ofensivo en el nombre visible (dato de prueba)", startsAt: at(-DAY), endsAt: at(7 * DAY), createdById: adminId },
  });
  await prisma.auditLog.create({
    data: { actorId: adminId, action: "ban.create", entityType: "User", entityId: eli.id, meta: { reason: "seed" } },
  });

  // Ajuste manual de créditos de ejemplo
  await postTransaction({
    userId: dani.id,
    amount: 20,
    type: "ADMIN_ADJUSTMENT",
    reason: "Compensación por un error en la pregunta 3 (dato de prueba)",
    idempotencyKey: `seed-adjust:${dani.id}`,
    createdById: adminId,
  });

  // Estado cacheado de los cuestionarios
  await prisma.$executeRaw`
    UPDATE "Quiz" SET status = (CASE
      WHEN "publishedAt" IS NULL THEN 'DRAFT'
      WHEN now() < "opensAt" THEN 'SCHEDULED'
      WHEN now() < "closesAt" THEN 'ACTIVE'
      WHEN now() < "expiresAt" THEN 'CLOSED'
      ELSE 'EXPIRED' END)::"QuizStatus"`;

  await recomputeAllStandings(now);
  console.log("  usuarios: moderador / Moderador123!  ·  ana, beto, caro, dani, eli / Jugador123!  (eli está baneado)");
}

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("Definí ADMIN_PASSWORD (mínimo 8 caracteres) para crear el admin.");
  const admin = await upsertUser(username, password, "ADMIN", "Administrador", process.env.ADMIN_EMAIL || undefined);
  console.log(`→ Admin: ${username}`);

  for (const [section, content] of Object.entries(defaultRulesTexts)) {
    await prisma.rulesText.upsert({ where: { section }, create: { section, content }, update: {} });
  }

  const hasData = (await prisma.category.count()) > 0;
  if (process.env.SEED_DEMO !== "false" && !hasData) await seedDemo(admin.id);
  else if (hasData) console.log("→ La base ya tiene datos: se omiten los datos de prueba.");
}

main()
  .then(() => console.log("✓ Seed completo"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
