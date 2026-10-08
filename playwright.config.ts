import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra una base separada (TEST_DATABASE_URL) que se resetea y se carga con el seed de prueba.
 * La app se levanta en el puerto 3201 para no chocar con `npm run dev`.
 */
const PORT = 3201;
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://pyr:pyr@localhost:5440/pyr_test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // next start no es compatible con output standalone: usamos el server de dev (el build se verifica aparte)
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: DB,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      APP_URL: `http://localhost:${PORT}`,
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
