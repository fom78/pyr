-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('NEW_FIRST', 'REUSED_FIRST');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "knockoutPools" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "questionSource" "QuestionSource" NOT NULL DEFAULT 'NEW_FIRST',
ADD COLUMN     "uniqueQuestions" INTEGER;

