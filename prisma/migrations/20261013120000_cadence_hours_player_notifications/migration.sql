-- Notificaciones para jugadores: misma tabla, separadas por audiencia.
CREATE TYPE "NotificationAudience" AS ENUM ('STAFF', 'PLAYER');
DROP INDEX "Notification_userId_readAt_idx";
ALTER TABLE "Notification" ADD COLUMN "audience" "NotificationAudience" NOT NULL DEFAULT 'STAFF';
CREATE INDEX "Notification_userId_audience_readAt_idx" ON "Notification"("userId", "audience", "readAt");

-- Aviso de corrección disponible: los cuestionarios ya cerrados no se avisan.
ALTER TABLE "Quiz" ADD COLUMN "reviewNotifiedAt" TIMESTAMP(3);
UPDATE "Quiz" SET "reviewNotifiedAt" = now() WHERE "closesAt" <= now();

-- La frecuencia sale del calendario (QuizSchedule).
ALTER TABLE "Category" DROP COLUMN "frequencyDays";

-- Calendario: de "días de la semana + hora" a grilla ancla + frecuencia en horas + días excluidos.
-- Conversión sin pérdida: cada 24 h a la misma hora, excluyendo los días que no estaban elegidos.
ALTER TABLE "QuizSchedule"
  ADD COLUMN "anchorAt" TIMESTAMP(3),
  ADD COLUMN "frequencyHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "excludedWeekdays" INTEGER[];
UPDATE "QuizSchedule" SET
  "anchorAt" = ((((now() AT TIME ZONE "timezone")::date + "timeOfDay"::time) AT TIME ZONE "timezone") AT TIME ZONE 'UTC'),
  "excludedWeekdays" = ARRAY(SELECT d FROM generate_series(0, 6) AS d WHERE NOT (d = ANY("weekdays")) ORDER BY d);
ALTER TABLE "QuizSchedule" ALTER COLUMN "anchorAt" SET NOT NULL;
ALTER TABLE "QuizSchedule" DROP COLUMN "timeOfDay", DROP COLUMN "weekdays";

-- Validez en horas: quiz.activeDays → quiz.activeHours (global y overrides por categoría).
INSERT INTO "AppSetting" ("key", "value", "updatedById", "updatedAt")
  SELECT 'quiz.activeHours', to_jsonb(("value"::text)::numeric * 24), "updatedById", now()
  FROM "AppSetting" WHERE "key" = 'quiz.activeDays'
  ON CONFLICT ("key") DO NOTHING;
DELETE FROM "AppSetting" WHERE "key" IN ('quiz.activeDays', 'quiz.frequencyDays');
UPDATE "Category" SET "settings" =
  CASE WHEN "settings" ? 'quiz.activeDays'
    THEN ("settings" - 'quiz.activeDays' - 'quiz.frequencyDays')
         || jsonb_build_object('quiz.activeHours', (("settings"->>'quiz.activeDays')::numeric * 24))
    ELSE "settings" - 'quiz.frequencyDays' END
  WHERE "settings" ?| ARRAY['quiz.activeDays', 'quiz.frequencyDays'];
