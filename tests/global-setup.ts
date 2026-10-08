import "dotenv/config";
import { execSync } from "node:child_process";

/** Aplica las migraciones en la base de test antes de correr la suite. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL no definida: se omiten los tests de integración.");
    return;
  }
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url } });
}
