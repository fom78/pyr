-- Aviso "nuevo cuestionario disponible": marca de envío por cuestionario.
ALTER TABLE "Quiz" ADD COLUMN "openNotifiedAt" TIMESTAMP(3);

-- Los que ya abrieron no se avisan de golpe.
UPDATE "Quiz" SET "openNotifiedAt" = now() WHERE "opensAt" <= now();
