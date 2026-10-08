import "dotenv/config";
import { prisma } from "../../src/server/db";

// Vacía la base E2E (llamado desde global-setup con DATABASE_URL = base de test).
async function main() {
  if (!/test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Solo se puede vaciar una base de test.");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

main().finally(() => prisma.$disconnect());
