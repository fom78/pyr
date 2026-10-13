#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Trae a la PC el último backup de un entorno de la VPS (lo genera el worker: diario y desde
# el panel → Backups) y, si querés, lo carga en la base local de Docker.
#
# Uso (desde Git Bash, WSL, Linux o macOS, en la carpeta del proyecto):
#   bash scripts/backup-pull.sh                  # último backup de prod → ./backups/prod/
#   bash scripts/backup-pull.sh dev              # de staging
#   bash scripts/backup-pull.sh prod --images    # también las imágenes subidas
#   bash scripts/backup-pull.sh prod --restore   # y lo carga en la base local (pide confirmación)
#   bash scripts/backup-pull.sh prod --file pyr-prod-20261013-033000.sql.gz   # uno puntual
#
# Necesita PYR_SSH = usuario@host de la VPS (o un alias de ~/.ssh/config), en el entorno o en
# .env.local / .env. Usa ssh/scp con tu clave. Nunca modifica nada en la VPS.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_NAME=prod
IMAGES=0
RESTORE=0
FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    prod|dev) ENV_NAME=$1 ;;
    --images) IMAGES=1 ;;
    --restore) RESTORE=1 ;;
    --file) shift; FILE=${1:-} ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1 (usá --help)"; exit 1 ;;
  esac
  shift
done

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_off=$'\e[0m'
step() { echo "${c_ok}▶ $*${c_off}"; }
warn() { echo "${c_warn}⚠ $*${c_off}"; }
die()  { echo "${c_err}✖ $*${c_off}" >&2; exit 1; }

env_value() { # env_value <VAR> <archivo>
  [ -f "$2" ] || return 0
  grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"  || true
}

SSH_TARGET=${PYR_SSH:-}
for f in .env.local .env; do
  [ -n "$SSH_TARGET" ] || SSH_TARGET=$(env_value PYR_SSH "$f")
done
[ -n "$SSH_TARGET" ] || die "Falta PYR_SSH (ej. deploy@1.2.3.4). Agregalo a .env.local o exportalo antes de correr el script."
command -v ssh >/dev/null && command -v scp >/dev/null || die "Hacen falta ssh y scp."

REMOTE_DIR=/opt/pyr/$ENV_NAME/backups
LOCAL_DIR=backups/$ENV_NAME
mkdir -p "$LOCAL_DIR"

if [ -z "$FILE" ]; then
  step "Buscando el último backup de $ENV_NAME en $SSH_TARGET…"
  FILE=$(ssh "$SSH_TARGET" "ls -1t $REMOTE_DIR/pyr-*.sql.gz 2>/dev/null | head -1" | xargs -r basename)
  [ -n "$FILE" ] || die "No hay backups en $REMOTE_DIR. Creá uno desde el panel (Backups) o esperá al diario."
fi
case "$FILE" in
  pyr-*.sql.gz) ;;
  *) die "Nombre de archivo inesperado: $FILE" ;;
esac

step "Descargando $FILE"
scp -q "$SSH_TARGET:$REMOTE_DIR/$FILE" "$LOCAL_DIR/"
echo "  → $LOCAL_DIR/$FILE ($(du -h "$LOCAL_DIR/$FILE" | cut -f1))"

UPLOADS="${FILE%.sql.gz}-uploads.tar.gz"
if [ "$IMAGES" = 1 ]; then
  if ssh "$SSH_TARGET" "test -f $REMOTE_DIR/$UPLOADS"; then
    step "Descargando $UPLOADS"
    scp -q "$SSH_TARGET:$REMOTE_DIR/$UPLOADS" "$LOCAL_DIR/"
    echo "  → $LOCAL_DIR/$UPLOADS ($(du -h "$LOCAL_DIR/$UPLOADS" | cut -f1))"
  else
    warn "Ese backup no tiene imágenes (¿el entorno usa S3?)."
    IMAGES=0
  fi
fi

[ "$RESTORE" = 1 ] || exit 0

# ── Restaurar en la base local (docker compose del proyecto) ──
DB_USER=pyr
DB_NAME=pyr
docker compose ps --status running db >/dev/null 2>&1 || die "Postgres local no está corriendo (docker compose up -d)."
echo
warn "Esto BORRA tu base local '$DB_NAME' (localhost:5440) y la reemplaza por $FILE."
[ "$IMAGES" = 1 ] && warn "También agrega las imágenes del backup a ./storage/uploads."
read -r -p "Escribí 'si' para seguir: " answer
[ "$answer" = "si" ] || die "Cancelado. El archivo quedó en $LOCAL_DIR/."

mkdir -p backups/local
SAFETY="backups/local/pyr-local-antes-de-restaurar-$(date +%Y%m%d-%H%M%S).sql.gz"
step "Copia de seguridad de tu base local → $SAFETY"
docker compose exec -T db pg_dump --no-owner --no-privileges -U "$DB_USER" "$DB_NAME" | gzip > "$SAFETY"

step "Restaurando $FILE en la base local…"
gunzip -c "$LOCAL_DIR/$FILE" | docker compose exec -T db sh -c \
  "psql -q -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' && psql -q -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1" >/dev/null

if [ "$IMAGES" = 1 ]; then
  step "Copiando imágenes a ./storage/uploads"
  mkdir -p storage/uploads
  # Ruta relativa: el tar de Git en Windows toma "C:\…" como un host remoto.
  tar -xzf "$LOCAL_DIR/$UPLOADS" -C storage/uploads
fi

echo
step "Listo. Tu base local ahora tiene los datos de $ENV_NAME."
warn "Los usuarios y contraseñas son los de $ENV_NAME. Si algo sale mal: gunzip -c $SAFETY | docker compose exec -T db psql -U $DB_USER $DB_NAME (después de vaciar el schema)."
