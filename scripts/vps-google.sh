#!/usr/bin/env bash
# Carga GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en los .env de la VPS (ingreso con Google).
#
#   bash vps-google.sh                    # dev y prod, pide las claves
#   bash vps-google.sh dev                # solo dev
#   bash vps-google.sh dev --reiniciar    # además reinicia ese entorno para que las tome
#
# Sin --reiniciar no toca los contenedores: el próximo deploy las toma solo.
# Las claves también se pueden pasar por entorno: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... bash vps-google.sh
set -euo pipefail

BASE=/opt/pyr
ENVS=()
RESTART=false
for arg in "$@"; do
  case "$arg" in
    dev|prod) ENVS+=("$arg") ;;
    --reiniciar) RESTART=true ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Argumento desconocido: $arg (usá dev, prod o --reiniciar)" >&2; exit 1 ;;
  esac
done
[ ${#ENVS[@]} -eq 0 ] && ENVS=(dev prod)

for env in "${ENVS[@]}"; do
  [ -w "$BASE/$env/.env" ] || { echo "No existe o no puedo escribir $BASE/$env/.env (¿corrés como deploy?)" >&2; exit 1; }
done

GID="${GOOGLE_CLIENT_ID:-}"
GSECRET="${GOOGLE_CLIENT_SECRET:-}"
[ -n "$GID" ] || read -rp "GOOGLE_CLIENT_ID: " GID
[ -n "$GSECRET" ] || { read -rsp "GOOGLE_CLIENT_SECRET: " GSECRET; echo; }
GID="$(printf '%s' "$GID" | tr -d '[:space:]"')"
GSECRET="$(printf '%s' "$GSECRET" | tr -d '[:space:]"')"

[[ "$GID" == *.apps.googleusercontent.com ]] || { echo "El ID tiene que terminar en .apps.googleusercontent.com" >&2; exit 1; }
[ ${#GSECRET} -ge 20 ] || { echo "El secreto parece incompleto" >&2; exit 1; }

for env in "${ENVS[@]}"; do
  f="$BASE/$env/.env"
  cp -p "$f" "$f.bak-google"
  tmp="$(mktemp "$f.XXXXXX")"
  grep -vE '^(GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)=' "$f" > "$tmp" || true
  printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\n' "$GID" "$GSECRET" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$f"

  url="$(grep -E '^(BETTER_AUTH_URL|APP_URL)=' "$f" | head -1 | cut -d= -f2- | tr -d '"')"
  echo "✔ $env: claves cargadas (copia en $f.bak-google)"
  echo "  URL pública: ${url:-(sin APP_URL ni BETTER_AUTH_URL!)}"
  echo "  En Google tiene que estar el retorno: ${url%/}/api/auth/callback/google"

  if $RESTART; then
    (cd "$BASE/$env" && docker compose -p "pyr-$env" -f compose.prod.yml up -d)
    echo "  reiniciado"
  fi
done

$RESTART || echo "No reinicié nada: el próximo deploy toma las claves (o volvé a correr con --reiniciar)."
