-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "scheduleId" TEXT,
ADD COLUMN     "slotAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "reused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "QuizSchedule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weekdays" INTEGER[],
    "timeOfDay" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "titleTemplate" TEXT NOT NULL DEFAULT '{categoria} · {fecha}',
    "difficultyMix" JSONB,
    "timeMode" "TimeMode" NOT NULL DEFAULT 'PER_QUESTION',
    "skippedSlots" TIMESTAMP(3)[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "NotificationLevel" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuizSchedule_categoryId_key" ON "QuizSchedule"("categoryId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_scheduleId_slotAt_key" ON "Quiz"("scheduleId", "slotAt");

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "QuizSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSchedule" ADD CONSTRAINT "QuizSchedule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
