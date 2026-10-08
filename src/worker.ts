/**
 * Worker de tareas programadas (pg-boss sobre Postgres, sin Redis).
 *   npm run worker          → modo continuo (dev, con watch)
 *   node dist/worker.mjs    → producción
 *   --once                  → ejecuta todas las tareas una vez y termina (útil para debug/cron)
 */
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { logger } from "@/server/logger";
import { prisma } from "@/server/db";
import { tasks, type TaskName } from "@/server/jobs/tasks";

const TZ = process.env.WORKER_TZ ?? "America/Argentina/Buenos_Aires";

async function runOnce() {
  for (const [name, t] of Object.entries(tasks)) {
    const started = Date.now();
    try {
      const result = await t.run();
      logger.info({ task: name, result, ms: Date.now() - started }, "tarea ejecutada");
    } catch (err) {
      logger.error({ err, task: name }, "tarea falló");
    }
  }
}

async function main() {
  if (process.argv.includes("--once")) {
    await runOnce();
    await prisma.$disconnect();
    return;
  }
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  await boss.start();

  for (const [name, t] of Object.entries(tasks) as [TaskName, (typeof tasks)[TaskName]][]) {
    await boss.createQueue(name);
    // Un solo job a la vez por cola; si una corrida se atrasa no se acumulan.
    await boss.work(name, { batchSize: 1 }, async () => {
      const started = Date.now();
      const result = await t.run();
      logger.debug({ task: name, result, ms: Date.now() - started }, "tarea ejecutada");
    });
    await boss.schedule(name, t.cron, {}, { tz: TZ });
  }
  logger.info({ tasks: Object.keys(tasks) }, "worker iniciado");
  // Al arrancar, poner todo al día.
  await runOnce();

  const stop = async () => {
    logger.info("deteniendo worker…");
    await boss.stop({ graceful: true });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => {
  logger.fatal({ err }, "el worker no pudo iniciar");
  process.exit(1);
});
