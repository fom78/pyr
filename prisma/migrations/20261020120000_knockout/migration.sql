-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('POINTS', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "SeedingMode" AS ENUM ('QUALIFICATION', 'RANDOM');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('PLAYED', 'BYE', 'WALKOVER', 'TIEBREAK');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "autoConfirmQualified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "format" "TournamentFormat" NOT NULL DEFAULT 'POINTS',
ADD COLUMN     "seeding" "SeedingMode" NOT NULL DEFAULT 'QUALIFICATION',
ADD COLUMN     "thirdPlaceMatch" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TournamentEntry" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "qualifiedFromId" TEXT,
ADD COLUMN     "qualifiedRank" INTEGER,
ADD COLUMN     "seed" INTEGER;

-- CreateTable
CREATE TABLE "TournamentQualifier" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "sourceTournamentId" TEXT NOT NULL,
    "topN" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "TournamentQualifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnockoutMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "playerAId" TEXT,
    "playerBId" TEXT,
    "seedA" INTEGER,
    "seedB" INTEGER,
    "quizId" TEXT,
    "winnerId" TEXT,
    "result" "MatchResult",
    "decidedAt" TIMESTAMP(3),
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnockoutMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentQualifier_sourceTournamentId_idx" ON "TournamentQualifier"("sourceTournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentQualifier_tournamentId_sourceTournamentId_key" ON "TournamentQualifier"("tournamentId", "sourceTournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnockoutMatch_quizId_key" ON "KnockoutMatch"("quizId");

-- CreateIndex
CREATE INDEX "KnockoutMatch_closesAt_idx" ON "KnockoutMatch"("closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnockoutMatch_tournamentId_round_position_key" ON "KnockoutMatch"("tournamentId", "round", "position");

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_qualifiedFromId_fkey" FOREIGN KEY ("qualifiedFromId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentQualifier" ADD CONSTRAINT "TournamentQualifier_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentQualifier" ADD CONSTRAINT "TournamentQualifier_sourceTournamentId_fkey" FOREIGN KEY ("sourceTournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnockoutMatch" ADD CONSTRAINT "KnockoutMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnockoutMatch" ADD CONSTRAINT "KnockoutMatch_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnockoutMatch" ADD CONSTRAINT "KnockoutMatch_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnockoutMatch" ADD CONSTRAINT "KnockoutMatch_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Las inscripciones existentes ya están confirmadas.
UPDATE "TournamentEntry" SET "confirmedAt" = "enrolledAt";
