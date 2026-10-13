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
| `bash scripts/backup-pull.sh [prod\|dev] [--images] [--restore]` | Trae el último backup de la VPS a `./backups/` (y opcionalmente lo carga en la base local). Necesita `PYR_SSH` |

Usuarios del seed: `admin` / `ADMIN_PASSWORD` del `.env`, `moderador` / `Moderador123!`, `ana` `beto` `caro` `dani` `eli` / `Jugador123!` (eli está baneado).

## Estructura
- `src/app/(auth)` ingreso/registro · `src/app/(app)` pantallas del jugador (en la UI el modo por categorías se llama **Liga**; la URL sigue siendo `/categorias`) · `src/app/admin` panel · `src/app/api` route handlers (juego, archivos, auth, health).
- `src/server/**` lógica de dominio. Las páginas y actions llaman a servicios; **no** escriben consultas Prisma complejas inline.
  - Funciones **puras** (testeadas en `tests/unit`): `quiz/status.ts`, `scoring/scoring.ts`, `ranking/compute.ts`, `wildcards/strategies.ts`, `league/lives.ts`, `auth/permissions.ts`, `autoquiz/{slots,pick,coverage,title}.ts`, `league/streak.ts`, `tickets/rules.ts`, `backups/{commands,tar}.ts`, `notifications/weekly.ts`.
  - Servicios con DB: `credits/service.ts` (ledger), `ranking/service.ts`, `config/service.ts`, etc. Aceptan un parámetro `db: Db` (cliente o transacción).
- `src/generated/prisma` cliente generado (no editar, no versionar).

## Convenciones y decisiones
- **Next 16 sin Cache Components** (`cacheComponents: false`): casi todo es por usuario y dinámico; usamos el modelo de render dinámico clásico. `src/proxy.ts` (ex-middleware) solo hace chequeo optimista de cookie.
- **Permisos**: siempre `can(actor, action)` / `requirePermission(action)` / `userCan()`. Nada de `if (role === ...)` sueltos.
- **Configuración de negocio**: todo parámetro "configurable" vive en `AppSetting` y se declara en `src/server/config/registry.ts` (schema Zod + default + label). Los overridables por categoría se marcan con `categoryOverride`. Nunca hardcodear números de reglas en la UI.
- **Estado de cuestionarios**: fuente de verdad `getQuizStatus(quiz, now)` (derivado de fechas). La columna `Quiz.status` es un caché que sincroniza el worker.
- **Puntaje**: snapshot `{ base, timeBonus, wrongPenalty }` guardado en `Quiz.scoring` al publicar; cambiar la config global no altera quizzes publicados salvo "recalcular".
- **Créditos**: solo vía `postTransaction` (lock por usuario, idempotencia por `idempotencyKey`, sin negativos). Saldo = suma de movimientos APPROVED.
- **Rankings**: tablas materializadas `CategoryStanding` / `TournamentStanding`, recalculadas al terminar cada intento, por eventos y por el worker (la ventana se desliza). Cálculo en TS (`ranking/compute.ts`).
- **Errores de usuario**: lanzar `UserError("mensaje en español")`; las actions devuelven `FormState` vía `toFormState`.
- **Fechas**: en DB en UTC; mostrar con `src/lib/format.ts` en la zona del usuario (default `America/Argentina/Buenos_Aires`).
- **Imágenes**: `processAndStoreImage` (sharp → WebP) + `StorageAdapter` (local o S3). En la DB se guardan *keys*, nunca URLs (salvo avatares externos de Google).
- **Registro**: email opcional; si falta se guarda `<usuario>@sin-email.invalid` (Better Auth exige email único).
- `server-only` solo en módulos exclusivos de Next (`auth/session.ts`); los servicios se comparten con el worker y los tests.
- Puertos locales: app 3200, Postgres 5440 (3000/5433 los usan otros proyectos de la máquina).

## Infra y deploy
- Imagen única (`Dockerfile`): web = `node server.js` (Next standalone), worker = `node dist/worker.mjs`, migraciones+seed = servicio `migrate` (`prisma migrate deploy && node dist/seed.mjs`). `npm run build:worker` bundlea worker y seed con esbuild.
- `scripts/vps-setup.sh` prepara una VPS desde cero (idempotente; genera Caddy y los `.env` porque el repo es privado). Si cambia `infra/proxy/*` o `docker/.env.example`, actualizar también el script. `scripts/vps-domain.sh` cambia los dominios después (Caddy + `APP_URL`) y repite la plantilla de `pyr.caddy`: mantenerlas iguales.
- `docker/compose.prod.yml` es el stack de un entorno (prod o dev) en la VPS; `infra/proxy/` es el Caddy compartido (un archivo por app en `sites/`). Guía completa: `docs/deploy.md`.
- CI: `.github/workflows/ci.yml` (lint, typecheck, Vitest con Postgres, build, Playwright). Deploy: `deploy.yml` (push a `dev` → staging, `main` → producción) vía GHCR + SSH.
- **package-lock.json**: npm en Windows tiene un bug con dependencias opcionales por plataforma (rolldown, lightningcss, etc.) que deja el lockfile incompleto y rompe `npm ci` en Linux. Si hay que regenerarlo, hacerlo dentro de un contenedor Linux:
  `docker run --rm -v "$PWD:/app" -w /app node:24-bookworm-slim npm install --package-lock-only --ignore-scripts` y luego `npm ci` local.
- `prisma migrate reset` está bloqueado para agentes de IA sin consentimiento explícito del usuario: no usarlo sin pedir permiso.

## Decisiones de reglas ante ambigüedades
- La tabla de liga cuenta cuestionarios **vigentes y cerrados computables** (`isComputable`), con `closesAt` dentro de la ventana; un quiz EXPIRED nunca computa. Se recalcula al terminar cada intento (`finalizeAttempt`), así el jugador ve su puesto al instante. Si el volumen crece, agrupar esos recálculos en un job pg-boss con `singletonKey` por categoría.
- Pregunta anulada: no suma ni resta para nadie y su tiempo no cuenta.
- Abandonar una categoría: pasa a LEAVING (no juega ni figura en tabla, ocupa vida) por `league.leaveCooldownDays`; no puede volver hasta `max(leaveCooldownDays, rejoinBlockDays)` desde que pidió salir. No se puede cancelar la salida.
- Cuestionarios de torneo no cuentan para la liga de la categoría.
- Doble total no duplica un puntaje negativo.
- Usuario baneado: se borran sus sesiones, se cierran sus intentos en curso y sale de las tablas al instante (y vuelve al levantar el baneo). No puede iniciar sesión mientras dure.
- Modo "tiempo por pregunta": cada pregunta vence a su hora; el intento además tiene un límite global (Σ tiempos + `game.attemptGraceSec`). Pausar *entre* preguntas no da ventaja porque la siguiente no se conoce hasta servirse.
- Las respuestas de un intento solo dicen "registrado"; la corrección se ve al cerrar el cuestionario (`review.revealAnswers`). El puntaje y el puesto sí se ven al terminar.
- Triple sorpresa: las preguntas se sortean al empezar el intento y se anuncian recién al servir cada una (`WildcardStrategy.announce`); nunca se revelan las siguientes.
- Racha (`computeStreak`): cuestionarios de liga de la categoría ordenados por `closesAt`; jugado suma, abierto sin jugar no corta (pendiente), cerrado sin jugar corta. Así el orden en que se juegan los abiertos no importa. Solo cuentan los que cierran después del último ingreso a la categoría. Cada vez que la racha llega a un múltiplo de `credits.streakLength` paga `credits.streakBonus` (idempotencia por intento).
- Torneo: los empates en un puesto premiado cobran el premio completo de ese puesto. El costo no se puede cambiar con inscriptos.
- Corregir la respuesta correcta de una pregunta bloqueada está permitido (es la vía para errores) y recalcula todos los cuestionarios que la usan; queda en auditoría.
- Liga: todos los cuestionarios de una categoría llevan exactamente `quiz.questionCount` preguntas (se valida al publicar; torneos libres). Así cada uno vale lo mismo en la tabla sin normalizar puntajes.
- Calendario automático (`QuizSchedule`, `src/server/autoquiz/`): grilla determinística, turno N = `anchorAt` + N × `frequencyHours` (con múltiplos de 24 a la misma hora local aunque haya cambio de horario; si no, horas absolutas). Un turno que cae en `excludedWeekdays` (día local de `timezone`, Buenos Aires) no se publica y la grilla no se corre. La validez (`quiz.activeHours`, default 72) es independiente de la frecuencia. El worker (`autoquiz`, cada 15 min) genera borradores por turno entre `alertHours` y `horizonDays`. Aprobar = `publishQuiz`. Un borrador completo sin aprobar se publica solo `autoquiz.autoPublishHours` antes de abrir (aparece como "Próximamente"; default activo, se apaga por categoría con `autoquiz.autoPublish`); uno incompleto o con la publicación automática apagada se descarta al llegar la apertura. Saltear/borrar un borrador anota el turno en `skippedSlots` para no regenerarlo. Un cuestionario manual se asigna a un turno con `createQuiz(..., { slotAt })` ("Asignar" en Próximos turnos): reemplaza al borrador automático y, si llega la apertura sin publicar, queda como borrador suelto (no se borra). Un quiz manual viejo sin `slotAt` a menos de 6 h de un turno lo ocupa. Un turno sin cuestionario dentro de `alertHours` avisa CRITICAL (`slot.unassigned`); con `autoquiz.rescueSlots` (por categoría, default apagado) el worker lo arma con el banco y lo publica en el acto si alcanzan las preguntas (`rescueSlots`, aviso `slot.rescued`).
- En la liga el orden de preguntas y opciones siempre se mezcla por intento (se fuerza al crear, editar y publicar).
- Preguntas de un borrador quedan reservadas (ya no son "nunca usadas"). Se eligen primero nunca usadas; si faltan y `autoquiz.allowReuse`, las usadas hace más de `reuseAfterDays`, la de uso más viejo primero (`QuizQuestion.reused`).
- Cobertura del banco: `projectCoverage` proyecta los turnos futuros contra las preguntas nunca usadas; si no cubren `coverageWarnDays` (o `coverageCriticalDays`) se avisa a admins y mods (`bank-coverage`, diario). Avisos dentro de la app: `Notification` con `audience` STAFF (`notifyStaff`, panel) o PLAYER (`notifyUsers`, campanita del jugador), dedupe por `dedupeKey`; no hay mail todavía. Entrar a la lista no marca nada: cada una se marca al abrirla (`/api/notifications/<id>/open`, con `<a>` común para que el prefetch no la marque) o con "Marcar todas como leídas". Al cerrar un cuestionario (`review-ready`, con `review.revealAnswers = ON_CLOSE`) se avisa a quienes lo terminaron que ya pueden ver la corrección. Otros avisos al jugador (`notifications/player.ts`, grupo "Avisos" de la config): al abrir un cuestionario de liga a los participantes activos (`quiz-opened`, `notify.newQuiz`, marca `Quiz.openNotifiedAt`; si abrió hace más de 12 h no se avisa); racha en riesgo `notify.streakRiskHours` antes del cierre a quien tiene racha real ≥ 2 y no lo empezó (`streak-risk`); resumen semanal los lunes (`weekly-summary`, `notify.weeklySummary`; `isSummaryDay` evita que un reinicio del worker lo mande otro día).
- Soporte (`src/server/tickets/`): el jugador reporta un error/sugerencia (con captura opcional, preset `ticket`; máx. 5 por día) y avisa a admins y mods. No es un chat: alguien del equipo lo **toma** (se puede tomar uno de otro; queda en el historial), lo **responde** y el autor da **un feedback por respuesta** ("Me sirvió" cierra; "No se resolvió" lo devuelve al que lo tenía). Tope `MAX_ROUNDS` = 3 respuestas; reabrir da una más. Notas internas (`NOTE`) nunca se muestran al usuario. Respondidos sin feedback se cierran solos a los 7 días (`tickets-autoclose`). Reglas puras en `tickets/rules.ts`; cada cambio usa un update condicional para no pisar acciones simultáneas.
- Backups (`src/server/backups/`, solo admins con `backup.manage`): los hace el **worker** (no hay contenedor aparte): diario (`backup-nightly`, una vez por día aunque se reinicie) y a pedido desde el panel (fila `Backup` PENDING → tarea `backups`). `pg_dump` → `.sql.gz` + imágenes locales → `-uploads.tar.gz` (tar propio, sin dependencias) en `BACKUP_DIR`; retención `BACKUP_RETENTION_DAYS` (manuales ×2). En Windows/local `BACKUP_PG_DUMP` usa el `pg_dump` del contenedor. La imagen instala `postgresql-client-17` (PGDG). La descarga resuelve el archivo desde la DB, nunca desde la URL.
- Seed: idempotente; nunca pisa una contraseña existente. Datos demo solo si `SEED_DEMO != "false"` y la base no tiene categorías.
