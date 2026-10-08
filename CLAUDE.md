@AGENTS.md

# PyR — guía para agentes y devs

App web de competencia de preguntas y respuestas (liga por categoría + torneos). UI en **español (es-AR)**; código, tablas y variables en **inglés**.

## Stack
Next.js 16 (App Router, `src/`), TypeScript, Prisma 7 + PostgreSQL 17, Better Auth, Tailwind 4 + shadcn/ui (radix), Zod 4, pg-boss (worker), ExcelJS, sharp, Vitest, Playwright.

## Comandos
| Comando | Qué hace |
|---|---|
| `bash scripts/dev.sh` | Todo el entorno local de una (requisitos, .env, deps, Postgres, migraciones, seed, app + worker). `--tests` / `--solo-preparar` / `--sin-worker` |
| `docker compose up -d` | Postgres local en `localhost:5440` (+ base `pyr_test`) |
| `npm run dev` | App en http://localhost:3200 |
| `npm run worker` | Worker de tareas programadas (pg-boss) en modo watch · `npm run worker:once` corre todas una vez |
| `npm run db:migrate` | Crear/aplicar migraciones en dev |
| `npm run db:seed` | Admin desde env + datos de prueba (si la base está vacía) |
| `npm run db:reset` | Borra todo, migra y re-seedea |
| `npm test` | Vitest (unit + integración contra `pyr_test`) |
| `npm run test:e2e` | Playwright |
| `npm run typecheck` / `npm run lint` | Chequeos estáticos |

Usuarios del seed: `admin` / `ADMIN_PASSWORD` del `.env`, `moderador` / `Moderador123!`, `ana` `beto` `caro` `dani` `eli` / `Jugador123!` (eli está baneado).

## Estructura
- `src/app/(auth)` ingreso/registro · `src/app/(app)` pantallas del jugador · `src/app/admin` panel · `src/app/api` route handlers (juego, archivos, auth, health).
- `src/server/**` lógica de dominio. Las páginas y actions llaman a servicios; **no** escriben consultas Prisma complejas inline.
  - Funciones **puras** (testeadas en `tests/unit`): `quiz/status.ts`, `scoring/scoring.ts`, `ranking/compute.ts`, `wildcards/strategies.ts`, `league/lives.ts`, `auth/permissions.ts`.
  - Servicios con DB: `credits/service.ts` (ledger), `ranking/service.ts`, `config/service.ts`, etc. Aceptan un parámetro `db: Db` (cliente o transacción).
- `src/generated/prisma` cliente generado (no editar, no versionar).

## Convenciones y decisiones
- **Next 16 sin Cache Components** (`cacheComponents: false`): casi todo es por usuario y dinámico; usamos el modelo de render dinámico clásico. `src/proxy.ts` (ex-middleware) solo hace chequeo optimista de cookie.
- **Permisos**: siempre `can(actor, action)` / `requirePermission(action)` / `userCan()`. Nada de `if (role === ...)` sueltos.
- **Configuración de negocio**: todo parámetro "configurable" vive en `AppSetting` y se declara en `src/server/config/registry.ts` (schema Zod + default + label). Los overridables por categoría se marcan con `categoryOverride`. Nunca hardcodear números de reglas en la UI.
- **Estado de cuestionarios**: fuente de verdad `getQuizStatus(quiz, now)` (derivado de fechas). La columna `Quiz.status` es un caché que sincroniza el worker.
- **Puntaje**: snapshot `{ base, timeBonus, wrongPenalty }` guardado en `Quiz.scoring` al publicar; cambiar la config global no altera quizzes publicados salvo "recalcular".
- **Créditos**: solo vía `postTransaction` (lock por usuario, idempotencia por `idempotencyKey`, sin negativos). Saldo = suma de movimientos APPROVED.
- **Rankings**: tablas materializadas `CategoryStanding` / `TournamentStanding`, recalculadas por eventos y por el worker (la ventana se desliza). Cálculo en TS (`ranking/compute.ts`).
- **Errores de usuario**: lanzar `UserError("mensaje en español")`; las actions devuelven `FormState` vía `toFormState`.
- **Fechas**: en DB en UTC; mostrar con `src/lib/format.ts` en la zona del usuario (default `America/Argentina/Buenos_Aires`).
- **Imágenes**: `processAndStoreImage` (sharp → WebP) + `StorageAdapter` (local o S3). En la DB se guardan *keys*, nunca URLs (salvo avatares externos de Google).
- **Registro**: email opcional; si falta se guarda `<usuario>@sin-email.invalid` (Better Auth exige email único).
- `server-only` solo en módulos exclusivos de Next (`auth/session.ts`); los servicios se comparten con el worker y los tests.
- Puertos locales: app 3200, Postgres 5440 (3000/5433 los usan otros proyectos de la máquina).

## Infra y deploy
- Imagen única (`Dockerfile`): web = `node server.js` (Next standalone), worker = `node dist/worker.mjs`, migraciones+seed = servicio `migrate` (`prisma migrate deploy && node dist/seed.mjs`). `npm run build:worker` bundlea worker y seed con esbuild.
- `docker/compose.prod.yml` es el stack de un entorno (prod o dev) en la VPS; `infra/proxy/` es el Caddy compartido (un archivo por app en `sites/`). Guía completa: `docs/deploy.md`.
- CI: `.github/workflows/ci.yml` (lint, typecheck, Vitest con Postgres, build, Playwright). Deploy: `deploy.yml` (push a `dev` → staging, `main` → producción) vía GHCR + SSH.
- **package-lock.json**: npm en Windows tiene un bug con dependencias opcionales por plataforma (rolldown, lightningcss, etc.) que deja el lockfile incompleto y rompe `npm ci` en Linux. Si hay que regenerarlo, hacerlo dentro de un contenedor Linux:
  `docker run --rm -v "$PWD:/app" -w /app node:24-bookworm-slim npm install --package-lock-only --ignore-scripts` y luego `npm ci` local.
- `prisma migrate reset` está bloqueado para agentes de IA sin consentimiento explícito del usuario: no usarlo sin pedir permiso.

## Decisiones de reglas ante ambigüedades
- La ventana del ranking se evalúa sobre `closesAt`; un quiz EXPIRED nunca computa.
- Pregunta anulada: no suma ni resta para nadie y su tiempo no cuenta.
- Abandonar una categoría: pasa a LEAVING (no juega ni figura en tabla, ocupa vida) por `league.leaveCooldownDays`; no puede volver hasta `max(leaveCooldownDays, rejoinBlockDays)` desde que pidió salir. No se puede cancelar la salida.
- Cuestionarios de torneo no cuentan para la liga de la categoría.
- Doble total no duplica un puntaje negativo.
- Usuario baneado: se borran sus sesiones, se cierran sus intentos en curso y sale de las tablas al instante (y vuelve al levantar el baneo). No puede iniciar sesión mientras dure.
- Modo "tiempo por pregunta": cada pregunta vence a su hora; el intento además tiene un límite global (Σ tiempos + `game.attemptGraceSec`). Pausar *entre* preguntas no da ventaja porque la siguiente no se conoce hasta servirse.
- Las respuestas de un intento solo dicen "registrado"; la corrección se ve al cerrar el cuestionario (`review.revealAnswers`).
- Racha: cuestionarios de liga consecutivos de una categoría (por fecha de apertura) jugados sin saltear; cada `credits.streakLength` paga `credits.streakBonus`.
- Torneo: los empates en un puesto premiado cobran el premio completo de ese puesto. El costo no se puede cambiar con inscriptos.
- Corregir la respuesta correcta de una pregunta bloqueada está permitido (es la vía para errores) y recalcula todos los cuestionarios que la usan; queda en auditoría.
- Seed: idempotente; nunca pisa una contraseña existente. Datos demo solo si `SEED_DEMO != "false"` y la base no tiene categorías.
