#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prepara una VPS nueva (Ubuntu 22.04/24.04 o Debian 12) para PyR y futuras apps.
# Ejecutar como root, una vez (se puede repetir: no pisa lo que ya existe).
#
#   scp scripts/vps-setup.sh root@IP:/root/
#   ssh root@IP
#   bash vps-setup.sh
#
# Hace:
#   1. Actualiza el sistema e instala lo básico (ufw, fail2ban, actualizaciones automáticas)
#   2. Swap si hay poca RAM
#   3. Usuario "deploy" (sin contraseña, entra con las mismas claves SSH que root)
#   4. Docker + rotación de logs
#   5. Firewall: solo SSH, 80 y 443
#   6. Endurece SSH (sin root ni contraseña) SOLO si hay una clave SSH configurada
#   7. Clave SSH para que GitHub Actions despliegue
#   8. Caddy compartido (reverse proxy con HTTPS automático) en /opt/proxy
#   9. /opt/pyr/prod y /opt/pyr/dev con su .env (secretos generados al azar)
#  10. Login en GitHub Container Registry (si pasás un token)
#
# Se puede correr sin preguntas pasando variables:
#   PROD_DOMAIN=trivia.ejemplo.com DEV_DOMAIN=dev.trivia.ejemplo.com ACME_EMAIL=yo@ejemplo.com \
#   GH_OWNER=fom78 GH_REPO=pyr GHCR_TOKEN=ghp_xxx bash vps-setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_b=$'\e[1m'; c_off=$'\e[0m'
step() { echo; echo "${c_ok}${c_b}▶ $*${c_off}"; }
info() { echo "  $*"; }
warn() { echo "${c_warn}⚠ $*${c_off}"; }
die()  { echo "${c_err}✖ $*${c_off}" >&2; exit 1; }

# La salida detallada (apt, instalador de Docker, etc.) va a un log; si algo falla se avisa dónde mirar.
LOG=/var/log/pyr-vps-setup.log
trap 'echo "${c_err}✖ Falló en la línea $LINENO. Detalle en $LOG (tail -50 $LOG).${c_off}" >&2' ERR

[ "$(id -u)" -eq 0 ] || die "Ejecutalo como root (sudo bash vps-setup.sh)."
. /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) die "Sistema no soportado: ${PRETTY_NAME:-desconocido}. Usá Ubuntu o Debian." ;; esac

ask() { # ask VAR "pregunta" "default"
  local var=$1 q=$2 def=${3:-} cur=${!1:-}
  if [ -n "$cur" ]; then return; fi
  if [ -t 0 ]; then
    read -r -p "  $q${def:+ [$def]}: " cur || true
  fi
  printf -v "$var" '%s' "${cur:-$def}"
}

rand() { openssl rand -base64 "${1:-32}" | tr -d '\n/+=' | cut -c1-"${2:-40}"; }

# ── Datos ───────────────────────────────────────────────────────────────────
step "Datos de configuración"
ask PROD_DOMAIN "Dominio de producción" "trivia.ejemplo.com"
ask DEV_DOMAIN  "Dominio de staging" "dev.${PROD_DOMAIN}"
ask ACME_EMAIL  "Email para los certificados HTTPS (Let's Encrypt)" ""
ask GH_OWNER    "Usuario u organización de GitHub" "fom78"
ask GH_REPO     "Repositorio" "pyr"
ask DEPLOY_USER "Usuario de deploy" "deploy"
ask GHCR_TOKEN  "Token de GitHub con permiso read:packages (Enter para hacerlo después)" ""
[ -n "$ACME_EMAIL" ] || die "Falta el email para Let's Encrypt."
IMAGE="ghcr.io/$(echo "$GH_OWNER/$GH_REPO" | tr '[:upper:]' '[:lower:]')"
CRED_FILE=/root/pyr-credenciales.txt

# ── 1. Sistema ──────────────────────────────────────────────────────────────
step "1. Actualizando el sistema"
export DEBIAN_FRONTEND=noninteractive
echo "=== $(date -Iseconds) ===" >>"$LOG"
info "(puede tardar unos minutos; detalle en $LOG)"
apt-get update -qq >>"$LOG" 2>&1
apt-get -y -qq -o Dpkg::Options::=--force-confold upgrade >>"$LOG" 2>&1
apt-get install -y -qq ca-certificates curl gnupg openssl ufw fail2ban unattended-upgrades dnsutils sudo >>"$LOG" 2>&1
timedatectl set-timezone America/Argentina/Buenos_Aires 2>/dev/null || true
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now fail2ban >/dev/null 2>&1 || true
info "Paquetes al día, actualizaciones de seguridad automáticas y fail2ban activos."

# ── 2. Swap ─────────────────────────────────────────────────────────────────
step "2. Memoria swap"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$(swapon --show | wc -l)" -eq 0 ] && [ "$MEM_MB" -lt 6000 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  sysctl -q vm.swappiness=10 && echo 'vm.swappiness=10' >/etc/sysctl.d/99-swappiness.conf
  info "Swap de 2 GB creada (RAM: ${MEM_MB} MB)."
else
  info "No hace falta (RAM: ${MEM_MB} MB, swap: $(swapon --show --noheadings | wc -l) activa)."
fi

# ── 3. Usuario de deploy ────────────────────────────────────────────────────
step "3. Usuario $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER" >/dev/null
  info "Creado."
else
  info "Ya existía."
fi
DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
touch "$DEPLOY_HOME/.ssh/authorized_keys"
if [ -s /root/.ssh/authorized_keys ]; then
  # Copia las claves de root que todavía no estén
  while IFS= read -r key; do
    [ -n "$key" ] && ! grep -qxF "$key" "$DEPLOY_HOME/.ssh/authorized_keys" && echo "$key" >>"$DEPLOY_HOME/.ssh/authorized_keys"
  done </root/.ssh/authorized_keys
  info "Tus claves SSH de root también sirven para entrar como $DEPLOY_USER."
fi
chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh"

# ── 4. Docker ───────────────────────────────────────────────────────────────
step "4. Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh >>"$LOG" 2>&1
  info "Docker instalado."
else
  info "Ya estaba instalado: $(docker --version)"
fi
if [ ! -f /etc/docker/daemon.json ]; then
  # Sin esto, los logs de los contenedores crecen hasta llenar el disco
  cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
  systemctl restart docker
  info "Rotación de logs configurada (10 MB × 5 por contenedor)."
fi
systemctl enable --now docker >/dev/null 2>&1
usermod -aG docker "$DEPLOY_USER"

# ── 5. Firewall ─────────────────────────────────────────────────────────────
step "5. Firewall"
SSH_PORT=$(sshd -T 2>/dev/null | awk '/^port / {print $2; exit}'); SSH_PORT=${SSH_PORT:-22}
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSH_PORT/tcp" comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 443/udp comment 'HTTP/3' >/dev/null
ufw --force enable >/dev/null
info "Abiertos: SSH ($SSH_PORT), 80 y 443. Todo lo demás cerrado."
warn "Docker publica puertos por fuera de ufw: por eso ningún contenedor publica puertos salvo Caddy."

# ── 6. SSH ──────────────────────────────────────────────────────────────────
step "6. SSH"
if [ -s "$DEPLOY_HOME/.ssh/authorized_keys" ] && grep -qE '^(ssh-|ecdsa-)' "$DEPLOY_HOME/.ssh/authorized_keys"; then
  cat >/etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxAuthTries 4
EOF
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    info "Contraseñas desactivadas: solo se entra con clave SSH."
  else
    rm -f /etc/ssh/sshd_config.d/99-hardening.conf
    warn "La configuración de SSH no validó; no se cambió nada."
  fi
else
  warn "No hay ninguna clave SSH configurada: NO desactivo las contraseñas para no dejarte afuera."
  warn "Cargá tu clave pública en /root/.ssh/authorized_keys y volvé a correr el script."
fi

# ── 7. Clave para GitHub Actions ────────────────────────────────────────────
step "7. Clave SSH para GitHub Actions"
GH_KEY="$DEPLOY_HOME/.ssh/github_actions"
if [ ! -f "$GH_KEY" ]; then
  sudo -u "$DEPLOY_USER" ssh-keygen -q -t ed25519 -N "" -C "github-actions-deploy" -f "$GH_KEY"
  echo "$(cat "$GH_KEY.pub")" >>"$DEPLOY_HOME/.ssh/authorized_keys"
  info "Generada. La privada va al secret VPS_SSH_KEY (se muestra al final)."
else
  info "Ya existía."
fi

# ── 8. Caddy compartido ─────────────────────────────────────────────────────
step "8. Reverse proxy (Caddy)"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" /opt/proxy /opt/proxy/sites
cat >/opt/proxy/compose.yml <<'EOF'
# Reverse proxy compartido por todas las apps de la VPS (HTTPS automático con Let's Encrypt).
# Cada app agrega su archivo en sites/ y se recarga con:
#   docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
name: proxy
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      ACME_EMAIL: ${ACME_EMAIL}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./sites:/etc/caddy/sites:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [proxy]
volumes:
  caddy_data:
  caddy_config:
networks:
  proxy:
    external: true
EOF
cat >/opt/proxy/Caddyfile <<'EOF'
{
	email {$ACME_EMAIL}
}

# Cada app de la VPS tiene su archivo en sites/*.caddy
import sites/*.caddy
EOF
echo "ACME_EMAIL=$ACME_EMAIL" >/opt/proxy/.env
if [ ! -f /opt/proxy/sites/pyr.caddy ]; then
  cat >/opt/proxy/sites/pyr.caddy <<EOF
# PyR — producción y staging
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

$PROD_DOMAIN {
	import pyr_common
	reverse_proxy pyr-prod-web:3000
}

$DEV_DOMAIN {
	import pyr_common
	header X-Robots-Tag "noindex, nofollow"
	reverse_proxy pyr-dev-web:3000
}
EOF
  info "sites/pyr.caddy creado para $PROD_DOMAIN y $DEV_DOMAIN."
else
  info "sites/pyr.caddy ya existía (no se modifica)."
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/proxy
docker network inspect proxy >/dev/null 2>&1 || docker network create proxy >/dev/null
(cd /opt/proxy && docker compose up -d --quiet-pull >>"$LOG" 2>&1) || die "No se pudo levantar Caddy. Detalle: tail -30 $LOG"
docker compose -f /opt/proxy/compose.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
info "Caddy corriendo. Mientras la app no esté desplegada, los dominios responden 502 (es normal)."

# ── 9. Entornos de PyR ──────────────────────────────────────────────────────
step "9. Entornos de PyR"
: >"$CRED_FILE.tmp"
make_env() { # make_env <prod|dev> <dominio> <tag> <seed_demo>
  local env=$1 domain=$2 tag=$3 seed=$4 dir=/opt/pyr/$1
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$dir" "$dir/backups"
  if [ -f "$dir/.env" ]; then
    info "$dir/.env ya existía (no se modifica)."
    return
  fi
  local admin_pass; admin_pass=$(rand 24 16)
  cat >"$dir/.env" <<EOF
# PyR — entorno $env ($domain). Generado por vps-setup.sh el $(date -Iseconds)
PYR_IMAGE=$IMAGE
PYR_TAG=$tag
PYR_PROXY_ALIAS=pyr-$env-web

POSTGRES_USER=pyr
POSTGRES_PASSWORD=$(rand 32 40)
POSTGRES_DB=pyr

APP_URL=https://$domain
BETTER_AUTH_URL=https://$domain
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
LOG_LEVEL=info
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

ADMIN_USERNAME=admin
ADMIN_EMAIL=$ACME_EMAIL
ADMIN_PASSWORD=$admin_pass
SEED_DEMO=$seed

STORAGE_DRIVER=local

BACKUP_RETENTION_DAYS=14
BACKUP_CRON=30 3 * * *
BACKUP_DIR=$dir/backups
TZ=America/Argentina/Buenos_Aires
EOF
  chmod 600 "$dir/.env"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$dir/.env"
  echo "$env ($domain): usuario admin / $admin_pass" >>"$CRED_FILE.tmp"
  info "$dir/.env creado (base de datos y secretos propios)."
}
make_env prod "$PROD_DOMAIN" main false
make_env dev "$DEV_DOMAIN" dev true

# ── 10. Registro de imágenes ────────────────────────────────────────────────
step "10. GitHub Container Registry"
if [ -n "$GHCR_TOKEN" ]; then
  if echo "$GHCR_TOKEN" | sudo -u "$DEPLOY_USER" docker login ghcr.io -u "$GH_OWNER" --password-stdin >/dev/null 2>&1; then
    info "Login correcto: la VPS puede bajar las imágenes privadas."
  else
    warn "El login falló. Revisá que el token tenga el permiso read:packages."
  fi
elif sudo -u "$DEPLOY_USER" test -f "$DEPLOY_HOME/.docker/config.json" && grep -q ghcr.io "$DEPLOY_HOME/.docker/config.json"; then
  info "Ya había login en ghcr.io."
else
  warn "Sin token: hacelo después como $DEPLOY_USER:"
  warn "  echo TOKEN | docker login ghcr.io -u $GH_OWNER --password-stdin"
fi

# ── Resumen ─────────────────────────────────────────────────────────────────
IP=$(curl -fsS -4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
if [ -s "$CRED_FILE.tmp" ]; then
  { echo "Credenciales iniciales de PyR ($(date -Iseconds))"; cat "$CRED_FILE.tmp"; } >>"$CRED_FILE"
  chmod 600 "$CRED_FILE"
fi
rm -f "$CRED_FILE.tmp"

step "DNS"
for d in "$PROD_DOMAIN" "$DEV_DOMAIN"; do
  r=$(dig +short A "$d" | tail -1)
  if [ "$r" = "$IP" ]; then info "✓ $d → $IP"; else warn "$d apunta a '${r:-nada}' (debería ser $IP). Creá o corregí el registro A."; fi
done

cat <<EOF

${c_ok}${c_b}✓ VPS lista.${c_off}

${c_b}En GitHub → Settings → Secrets and variables → Actions${c_off}, cargá:
  VPS_HOST     = $IP
  VPS_USER     = $DEPLOY_USER
  VPS_PORT     = $SSH_PORT   (solo si no es 22)
  VPS_SSH_KEY  = el bloque completo de abajo (desde -----BEGIN hasta END-----):

$(cat "$GH_KEY")

${c_b}En GitHub → Settings → Environments${c_off}: crear "staging" y "production"
(recomendado: en production, "Required reviewers").

${c_b}Contraseñas del admin de la app${c_off}: guardadas en $CRED_FILE
$(cat "$CRED_FILE" 2>/dev/null | tail -2)

${c_b}Siguiente paso${c_off}: hacé push a "dev" → se despliega en https://$DEV_DOMAIN
Para ver qué pasa en la VPS:
  cd /opt/pyr/dev && docker compose -p pyr-dev -f compose.prod.yml logs -f

${c_warn}Probá en otra terminal que podés entrar como $DEPLOY_USER (ssh $DEPLOY_USER@$IP) antes de cerrar esta sesión.${c_off}
EOF
