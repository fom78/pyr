#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Levanta todo el entorno de desarrollo de PyR en la PC local:
#   1. Verifica Node y Docker
#   2. Crea .env (si no existe) con un secreto generado
#   3. Instala dependencias (si hace falta)
#   4. Levanta Postgres (Docker) y espera a que esté listo
#   5. Aplica migraciones y corre el seed (admin + datos de prueba si la base está vacía)
#   6. Arranca el worker en segundo plano y la app en primer plano
#
# Uso (desde Git Bash, WSL, Linux o macOS):
#   bash scripts/dev.sh                 # todo
#   bash scripts/dev.sh --sin-worker    # sin el worker de tareas programadas
#   bash scripts/dev.sh --solo-preparar # prepara todo pero no arranca app ni worker
#   bash scripts/dev.sh --tests         # prepara y corre lint + typecheck + tests (no arranca nada)
# Ctrl+C detiene la app y el worker. Postgres queda corriendo (docker compose down para apagarlo).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)

WITH_WORKER=1
START=1
RUN_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --sin-worker) WITH_WORKER=0 ;;
    --solo-preparar) START=0 ;;
    --tests) START=0; RUN_TESTS=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $arg (usá --help)"; exit 1 ;;
  esac
done

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_dim=$'\e[2m'; c_off=$'\e[0m'
step() { echo; echo "${c_ok}▶ $*${c_off}"; }
warn() { echo "${c_warn}⚠ $*${c_off}"; }
die()  { echo "${c_err}✖ $*${c_off}" >&2; exit 1; }

# Lee una variable del .env (sin comillas)
env_get() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# ── 1. Requisitos ────────────────────────────────────────────────────────────
step "Verificando requisitos"
command -v node >/dev/null || die "No se encontró Node.js. Instalá Node 22 o superior: https://nodejs.org"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 22 ] || die "Node $NODE_MAJOR es muy viejo: se necesita 22 o superior."
command -v docker >/dev/null || die "No se encontró Docker. Instalá Docker Desktop."
if ! docker info >/dev/null 2>&1; then
  if [ -x "/c/Program Files/Docker/Docker/Docker Desktop.exe" ]; then
    warn "Docker no está corriendo: abriendo Docker Desktop…"
    "/c/Program Files/Docker/Docker/Docker Desktop.exe" >/dev/null 2>&1 &
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
  docker info >/dev/null 2>&1 || die "Docker no responde. Abrí Docker Desktop y volvé a intentar."
fi
echo "  Node $(node -v) · $(docker --version | cut -d, -f1)"

# ── 2. .env ──────────────────────────────────────────────────────────────────
step "Variables de entorno"
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  node -e "
    const fs=require('fs');let s=fs.readFileSync('.env','utf8');
    s=s.replace(/^BETTER_AUTH_SECRET=.*/m,'BETTER_AUTH_SECRET=\"$SECRET\"');
    s=s.replace(/^ADMIN_PASSWORD=.*/m,'ADMIN_PASSWORD=\"Admin1234!\"');
    fs.writeFileSync('.env',s);"
  echo "  Se creó .env a partir de .env.example (admin: admin / Admin1234!). Revisalo si querés cambiar algo."
else
  echo "  .env ya existe ${c_dim}(no se modifica)${c_off}"
fi
grep -q "cambiar-por-un-secreto" .env && die "BETTER_AUTH_SECRET en .env todavía tiene el valor de ejemplo."
APP_PORT=$(env_get PORT); APP_PORT=${APP_PORT:-3200}
DB_PORT=$(env_get DATABASE_URL | sed -E 's|.*:([0-9]+)/.*|\1|'); DB_PORT=${DB_PORT:-5440}

# ── 3. Dependencias ──────────────────────────────────────────────────────────
step "Dependencias"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "  Instalando (npm ci)…"
  npm ci --no-audit --no-fund
else
  echo "  Al día ${c_dim}(node_modules más nuevo que package-lock.json)${c_off}"
  # El cliente de Prisma vive en src/generated (no versionado): regenerarlo si falta
  [ -f src/generated/prisma/client.ts ] || npx prisma generate
fi

# ── 4. Postgres ──────────────────────────────────────────────────────────────
step "Base de datos (Docker, puerto $DB_PORT)"
PYR_DB_PORT=$DB_PORT docker compose up -d db
printf "  Esperando a Postgres"
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U pyr >/dev/null 2>&1; then echo " ✓"; break; fi
  printf "."; sleep 1
done
docker compose exec -T db pg_isready -U pyr >/dev/null 2>&1 || die "Postgres no respondió. Mirá: docker compose logs db"
# La base de tests se crea con el script de init solo en el primer arranque del volumen; asegurarla igual
docker compose exec -T db psql -U pyr -d pyr -tc "SELECT 1 FROM pg_database WHERE datname='pyr_test'" | grep -q 1 \
  || docker compose exec -T db psql -U pyr -d pyr -c "CREATE DATABASE pyr_test OWNER pyr" >/dev/null

# ── 5. Migraciones + seed ────────────────────────────────────────────────────
step "Migraciones"
npx prisma migrate deploy
step "Seed (admin + datos de prueba si la base está vacía)"
npx prisma db seed

# ── Tests (opcional) ─────────────────────────────────────────────────────────
if [ "$RUN_TESTS" = 1 ]; then
  step "Lint";      npm run lint
  step "Tipos";     npm run typecheck
  step "Tests";     npm test
  echo; echo "${c_ok}✓ Todo verde.${c_off} Para los E2E: npm run test:e2e"
  exit 0
fi

if [ "$START" = 0 ]; then
  echo; echo "${c_ok}✓ Entorno listo.${c_off} Arrancá con: npm run dev  (y en otra terminal: npm run worker)"
  exit 0
fi

# ── 6. Worker + app ──────────────────────────────────────────────────────────
port_busy() { node -e "require('net').createServer().once('error',()=>process.exit(0)).once('listening',function(){this.close(()=>process.exit(1))}).listen($1)"; }
if port_busy "$APP_PORT"; then die "El puerto $APP_PORT ya está en uso (¿quedó otro npm run dev abierto?)."; fi

mkdir -p logs
PIDS=()

# Mata un proceso y todos sus hijos. En Git Bash (Windows) hay que usar el PID de Windows y taskkill /T.
kill_tree() {
  local pid=$1
  if [ -r "/proc/$pid/winpid" ] && command -v taskkill >/dev/null; then
    taskkill //F //T //PID "$(cat "/proc/$pid/winpid")" >/dev/null 2>&1 || true
  else
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
  fi
}

STOPPED=0
cleanup() {
  [ "$STOPPED" = 1 ] && return
  STOPPED=1
  echo; step "Deteniendo…"
  for pid in "${PIDS[@]}"; do kill_tree "$pid"; done
  echo "  App y worker detenidos. Postgres sigue corriendo (apagalo con: docker compose down)."
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if [ "$WITH_WORKER" = 1 ]; then
  step "Worker en segundo plano ${c_dim}(logs en logs/worker.log)${c_off}"
  npx tsx watch src/worker.ts >"$ROOT/logs/worker.log" 2>&1 &
  PIDS+=($!)
fi

step "App en http://localhost:$APP_PORT"
echo "  Usuarios de prueba: ana / Jugador123!  ·  moderador / Moderador123!  ·  admin / (ADMIN_PASSWORD del .env)"
echo "  Ctrl+C para detener."
echo
npm run dev &
PIDS+=($!)
# `wait` se interrumpe con Ctrl+C, así la limpieza corre enseguida. Si la app se cae, también se corta.
wait "${PIDS[-1]}"
