-- CreateEnum
CREATE TYPE "InventoryAsset" AS ENUM ('EXTRA_LIFE', 'STAR');

-- CreateEnum
CREATE TYPE "InventoryTxType" AS ENUM ('ADMIN_GRANT', 'ADMIN_REVOKE', 'TOURNAMENT_PRIZE', 'EXCHANGE', 'PURCHASE');

-- AlterTable
ALTER TABLE "TournamentResult" ADD COLUMN     "prizeStars" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" "InventoryAsset" NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "InventoryTxType" NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "meta" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryTransaction_userId_asset_idx" ON "InventoryTransaction"("userId", "asset");

-- CreateIndex
CREATE INDEX "InventoryTransaction_userId_createdAt_idx" ON "InventoryTransaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

