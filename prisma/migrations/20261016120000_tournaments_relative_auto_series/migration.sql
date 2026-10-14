-- Torneos: tiempos relativos, cuestionarios automáticos, series y resultados permanentes.

-- 1. Campos nuevos
ALTER TABLE "Tournament"
  ADD COLUMN "autoQuizzes" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "edition" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "frequencyHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "lateEntryDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextCreatedAt" TIMESTAMP(3),
  ADD COLUMN "questionsPerQuiz" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "quizActiveHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "registrationLeadDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "repeatEveryDays" INTEGER,
  ADD COLUMN "seriesId" TEXT,
  ADD COLUMN "seriesName" TEXT,
  ALTER COLUMN "quizCount" SET DEFAULT 7;

-- 2. Torneos existentes: frecuencia en horas, vigencia como se calculaba antes (min(activeHours, frecuencia)),
--    días relativos derivados de sus fechas y cuestionarios manuales (ya tienen los suyos: el generador no los toca).
UPDATE "Tournament" t SET
  "frequencyHours" = t."frequencyDays" * 24,
  "quizActiveHours" = LEAST(
    COALESCE((SELECT ("value")::text::int FROM "AppSetting" WHERE "key" = 'quiz.activeHours'), 72),
    t."frequencyDays" * 24
  ),
  "registrationLeadDays" = GREATEST(0, CEIL(EXTRACT(EPOCH FROM (t."startsAt" - t."registrationOpensAt")) / 86400))::int,
  "lateEntryDays" = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (t."registrationEndsAt" - t."startsAt")) / 86400))::int,
  "autoQuizzes" = false;

ALTER TABLE "Tournament" DROP COLUMN "frequencyDays";

-- 3. Resultados permanentes
CREATE TABLE "TournamentResult" (
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "participants" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "quizzesPlayed" INTEGER NOT NULL,
    "quizzesTotal" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "prizeCredits" INTEGER NOT NULL DEFAULT 0,
    "tournamentName" TEXT NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentResult_pkey" PRIMARY KEY ("tournamentId","userId")
);

CREATE INDEX "TournamentResult_userId_finishedAt_idx" ON "TournamentResult"("userId", "finishedAt");
CREATE UNIQUE INDEX "Quiz_tournamentId_slotAt_key" ON "Quiz"("tournamentId", "slotAt");
CREATE INDEX "Tournament_seriesId_idx" ON "Tournament"("seriesId");

ALTER TABLE "TournamentResult" ADD CONSTRAINT "TournamentResult_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentResult" ADD CONSTRAINT "TournamentResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Backfill: torneos ya terminados, desde su tabla final y los premios cobrados.
INSERT INTO "TournamentResult" ("tournamentId", "userId", "rank", "participants", "points", "quizzesPlayed", "quizzesTotal",
                                "correctCount", "prizeCredits", "tournamentName", "finishedAt")
SELECT s."tournamentId", s."userId", s."rank",
       COUNT(*) OVER (PARTITION BY s."tournamentId"),
       s."points", s."quizzesCounted",
       (SELECT COUNT(*) FROM "Quiz" q WHERE q."tournamentId" = t."id" AND q."publishedAt" IS NOT NULL),
       s."correctCount",
       COALESCE((SELECT SUM(c."amount") FROM "CreditTransaction" c
                 WHERE c."userId" = s."userId" AND c."type" = 'TOURNAMENT_PRIZE' AND c."status" = 'APPROVED'
                   AND c."meta"->>'tournamentId' = t."id"), 0),
       t."name", COALESCE(t."finishedAt", t."endsAt")
FROM "TournamentStanding" s
JOIN "Tournament" t ON t."id" = s."tournamentId"
WHERE t."status" = 'FINISHED';
