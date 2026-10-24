-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SeasonRunStatus" AS ENUM ('ACTIVE', 'FINISHED', 'CANCELLED');

-- DropIndex
DROP INDEX "TournamentQualifier_tournamentId_sourceTournamentId_key";

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "seasonRunId" TEXT,
ADD COLUMN     "seasonStageId" TEXT;

-- AlterTable
ALTER TABLE "TournamentEntry" ADD COLUMN     "qualifierId" TEXT;

-- AlterTable
ALTER TABLE "TournamentQualifier" ADD COLUMN     "fromRank" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageKey" TEXT,
    "status" "SeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "repeatAfterDays" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonStage" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonQualifierRule" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "sourceStageId" TEXT NOT NULL,
    "targetStageId" TEXT NOT NULL,
    "fromRank" INTEGER NOT NULL,
    "toRank" INTEGER NOT NULL,

    CONSTRAINT "SeasonQualifierRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonRun" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "day0" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SeasonRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

-- CreateIndex
CREATE INDEX "SeasonStage_seasonId_idx" ON "SeasonStage"("seasonId");

-- CreateIndex
CREATE INDEX "SeasonQualifierRule_seasonId_idx" ON "SeasonQualifierRule"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonRun_seasonId_number_key" ON "SeasonRun"("seasonId", "number");

-- CreateIndex
CREATE INDEX "Tournament_seasonRunId_idx" ON "Tournament"("seasonRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentQualifier_tournamentId_sourceTournamentId_fromRan_key" ON "TournamentQualifier"("tournamentId", "sourceTournamentId", "fromRank");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seasonRunId_fkey" FOREIGN KEY ("seasonRunId") REFERENCES "SeasonRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seasonStageId_fkey" FOREIGN KEY ("seasonStageId") REFERENCES "SeasonStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_qualifierId_fkey" FOREIGN KEY ("qualifierId") REFERENCES "TournamentQualifier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStage" ADD CONSTRAINT "SeasonStage_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonQualifierRule" ADD CONSTRAINT "SeasonQualifierRule_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonQualifierRule" ADD CONSTRAINT "SeasonQualifierRule_sourceStageId_fkey" FOREIGN KEY ("sourceStageId") REFERENCES "SeasonStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonQualifierRule" ADD CONSTRAINT "SeasonQualifierRule_targetStageId_fkey" FOREIGN KEY ("targetStageId") REFERENCES "SeasonStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRun" ADD CONSTRAINT "SeasonRun_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: clasificados ya inscriptos quedan atados a su regla.
UPDATE "TournamentEntry" e SET "qualifierId" = q."id"
FROM "TournamentQualifier" q
WHERE e."qualifiedFromId" IS NOT NULL AND q."tournamentId" = e."tournamentId" AND q."sourceTournamentId" = e."qualifiedFromId";
