import "dotenv/config";
import { execSync } from "node:child_process";

/** Base E2E limpia: migraciones + vaciado + seed de prueba. Solo toca TEST_DATABASE_URL. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://pyr:pyr@localhost:5440/pyr_test";
  if (!/test/.test(url)) throw new Error("Por seguridad, la base E2E debe contener 'test' en su nombre.");
  const env = { ...process.env, DATABASE_URL: url, SEED_DEMO: "true", ADMIN_PASSWORD: "Admin1234!" };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx tests/e2e/reset.ts", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
