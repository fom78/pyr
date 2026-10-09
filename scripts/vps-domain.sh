#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cambia los dominios de PyR en la VPS: Caddy (sites/pyr.caddy) + APP_URL de cada
# entorno, recarga Caddy y recrea web/worker de los entornos que estén corriendo.
#
#   scp scripts/vps-domain.sh deploy@IP:~/
#   ssh deploy@IP
#   bash vps-domain.sh pyrtrivia.com.ar                       # dev = dev.pyrtrivia.com.ar
#   bash vps-domain.sh pyrtrivia.com.ar staging.pyrtrivia.com.ar
#
# - Antes de tocar nada verifica que los dominios apunten a esta VPS.
# - Si www.<dominio de prod> también apunta acá, agrega la redirección www → sin www.
# - Guarda copia de lo que modifica en ~/pyr-domain-backups/<fecha>; si Caddy
#   rechaza la configuración nueva, vuelve a la anterior.
# Correr como deploy (o root).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_b=$'\e[1m'; c_off=$'\e[0m'
step() { echo; echo "${c_ok}${c_b}▶ $*${c_off}"; }
info() { echo "  $*"; }
warn() { echo "${c_warn}⚠ $*${c_off}"; }
die()  { echo "${c_err}✖ $*${c_off}" >&2; exit 1; }

PROD=${1:-}
[ -n "$PROD" ] || die "Uso: bash vps-domain.sh <dominio-prod> [dominio-dev]   (ej: bash vps-domain.sh pyrtrivia.com.ar)"
PROD=${PROD#https://}; PROD=${PROD%%/*}
DEV=${2:-dev.$PROD}; DEV=${DEV#https://}; DEV=${DEV%%/*}
re='^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
[[ $PROD =~ $re ]] || die "Dominio inválido: $PROD"
[[ $DEV =~ $re ]] || die "Dominio inválido: $DEV"
[ "$PROD" != "$DEV" ] || die "Prod y dev no pueden tener el mismo dominio."

SITE=/opt/proxy/sites/pyr.caddy
PROXY_DIR=/opt/proxy
[ -f "$SITE" ] || die "No existe $SITE. ¿Corriste antes vps-setup.sh?"
docker info >/dev/null 2>&1 || die "No puedo usar Docker. Corré el script como deploy (o root)."
caddy() { docker compose -f "$PROXY_DIR/compose.yml" exec -T caddy caddy "$@"; }

# ── DNS ─────────────────────────────────────────────────────────────────────
step "Verificando DNS"
IP=$(curl -fsS -4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
resolve() { getent ahostsv4 "$1" | awk 'NR==1 {print $1}'; }
points_here() { [ "$(resolve "$1")" = "$IP" ]; }
for d in "$PROD" "$DEV"; do
  if points_here "$d"; then
    info "✓ $d → $IP"
  else
    die "$d apunta a '$(resolve "$d" || true)' y debería ser $IP. Revisá el registro A (en Cloudflare, con la nube gris: 'DNS only')."
  fi
done
WWW=""
if [ "${PROD#www.}" = "$PROD" ] && points_here "www.$PROD"; then
  WWW="www.$PROD"
  info "✓ $WWW → $IP (se redirige a $PROD)"
else
  info "www.$PROD no apunta acá: no se agrega redirección."
fi

# ── Copia de seguridad ──────────────────────────────────────────────────────
BK=$HOME/pyr-domain-backups/$(date +%Y%m%d-%H%M%S)
mkdir -p "$BK"
cp -p "$SITE" "$BK/pyr.caddy"
for env in prod dev; do
  if [ -f "/opt/pyr/$env/.env" ]; then cp -p "/opt/pyr/$env/.env" "$BK/$env.env"; fi
done
info "Copia de lo actual en $BK"

# ── Caddy ───────────────────────────────────────────────────────────────────
step "Caddy"
{
  cat <<'EOF'
# PyR — producción y staging (generado por vps-domain.sh)
(pyr_common) {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Frame-Options "DENY"
		-Server
	}
	request_body {
		max_size 30MB
	}
}
EOF
  cat <<EOF

$PROD {
	import pyr_common
	reverse_proxy pyr-prod-web:3000
}

$DEV {
	import pyr_common
	header X-Robots-Tag "noindex, nofollow"
	reverse_proxy pyr-dev-web:3000
}
EOF
  if [ -n "$WWW" ]; then
    cat <<EOF

$WWW {
	redir https://$PROD{uri} permanent
}
EOF
  fi
} >"$SITE.new"
mv "$SITE.new" "$SITE"
if [ "$(id -u)" -eq 0 ]; then chown --reference="$PROXY_DIR" "$SITE"; fi

restore_caddy() {
  cp -p "$BK/pyr.caddy" "$SITE"
  caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
}
if ! out=$(caddy validate --config /etc/caddy/Caddyfile 2>&1); then
  echo "$out" | tail -5
  restore_caddy
  die "Caddy rechazó la configuración nueva; se restauró la anterior."
fi
if ! out=$(caddy reload --config /etc/caddy/Caddyfile 2>&1); then
  echo "$out" | tail -5
  restore_caddy
  die "No se pudo recargar Caddy; se restauró la configuración anterior."
fi
info "Configuración recargada: $PROD, $DEV${WWW:+, $WWW → $PROD}"

# ── Entornos ────────────────────────────────────────────────────────────────
step "Entornos de PyR"
for env in prod dev; do
  dir=/opt/pyr/$env
  if [ "$env" = prod ]; then domain=$PROD; else domain=$DEV; fi
  if [ ! -f "$dir/.env" ]; then
    warn "$dir/.env no existe: se saltea $env."
    continue
  fi
  sed -i -E \
    -e "s|^APP_URL=.*|APP_URL=https://$domain|" \
    -e "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=https://$domain|" \
    -e "1s|^(# PyR — entorno $env) \([^)]*\)|\1 ($domain)|" \
    "$dir/.env"
  if [ "$(id -u)" -eq 0 ]; then chown --reference="$dir" "$dir/.env"; fi
  chmod 600 "$dir/.env"
  info "$env: APP_URL=https://$domain"

  if [ -f "$dir/compose.prod.yml" ] && [ -n "$(docker compose -p "pyr-$env" -f "$dir/compose.prod.yml" ps -q web 2>/dev/null)" ]; then
    # --no-deps: no toca la base ni vuelve a correr migraciones
    (cd "$dir" && docker compose -p "pyr-$env" -f compose.prod.yml up -d --no-deps --force-recreate web worker >/dev/null 2>&1) \
      || die "No se pudo recrear $env. Mirá: cd $dir && docker compose -p pyr-$env -f compose.prod.yml logs --tail 50 web"
    info "$env: web y worker recreados con la URL nueva."
  else
    info "$env: todavía no está desplegado (toma la URL nueva en el primer deploy)."
  fi
done

# ── Verificación ────────────────────────────────────────────────────────────
step "Verificando HTTPS (el primer certificado puede tardar hasta un minuto)"
check() { # check <dominio> → código HTTP; 000 si todavía no hay certificado
  local code=000
  for _ in $(seq 1 12); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$1/" || true)
    case $code in 2??|3??) break ;; esac
    sleep 5
  done
  echo "$code"
}
for d in "$DEV" "$PROD" ${WWW:+"$WWW"}; do
  code=$(check "$d")
  case $code in
    2??|3??) info "✓ https://$d ($code)" ;;
    502) warn "https://$d responde 502: Caddy y el certificado andan, pero esa app no está corriendo (normal si ese entorno aún no se desplegó)." ;;
    *) warn "https://$d respondió '$code'. Mirá: docker compose -f $PROXY_DIR/compose.yml logs --tail 50 caddy" ;;
  esac
done

cat <<EOF

${c_ok}${c_b}✓ Dominios actualizados.${c_off}
  Producción: https://$PROD${WWW:+  (y $WWW redirige ahí)}
  Staging:    https://$DEV

Los dominios anteriores dejaron de responder. Si usás login con Google, cargá en la
consola de Google estos "Authorized redirect URIs":
  https://$PROD/api/auth/callback/google
  https://$DEV/api/auth/callback/google
Copia de la configuración anterior: $BK
EOF
