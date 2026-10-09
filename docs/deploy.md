# Despliegue en la VPS

Arquitectura en la VPS (pensada para convivir con otras apps):

```
Internet ─► Caddy (stack "proxy", puertos 80/443, HTTPS automático)
              ├─ trivia.midominio.com      → pyr-prod-web:3000   (stack pyr-prod: web, worker, db, backup)
              ├─ dev.trivia.midominio.com  → pyr-dev-web:3000    (stack pyr-dev:  web, worker, db)
              └─ otra-app.midominio.com    → …                    (cada app agrega su archivo en sites/)
```

- Cada entorno es un *project* de Docker Compose distinto, con **su propia base de datos**, volúmenes y red interna.
- Solo el contenedor `web` de cada entorno se une a la red compartida `proxy`. Ningún contenedor publica puertos, salvo Caddy (80/443).
- Imagen única (`ghcr.io/<usuario>/<repo>`) para web, worker y migraciones. En cada deploy el servicio `migrate` aplica migraciones y corre el seed idempotente antes de que arranquen `web` y `worker`.

## 1. Preparar la VPS (una sola vez)

### Opción rápida: script

`scripts/vps-setup.sh` hace los pasos 1, 3 y 4 de esta guía (usuario, Docker, firewall, SSH, swap, Caddy, `.env` de prod y dev con secretos al azar, clave para GitHub Actions y login en GHCR). Es idempotente: se puede volver a correr sin pisar nada.

```bash
scp scripts/vps-setup.sh root@IP:/root/
ssh root@IP
bash vps-setup.sh        # pregunta dominios, email y token; al final muestra lo que hay que cargar en GitHub
```

Requisito: haber cargado tu clave SSH pública al crear la VPS (si no, el script no desactiva las contraseñas para no dejarte afuera). Las contraseñas iniciales del admin quedan en `/root/pyr-credenciales.txt` y el detalle de lo que hizo en `/var/log/pyr-vps-setup.log`.

### Opción manual

Probado con Ubuntu 24.04 / Debian 12. Como root:

```bash
# Usuario de deploy
adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh

# Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Firewall: solo SSH y web
apt-get install -y ufw
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw enable

# SSH: sin contraseña ni root
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh

# Actualizaciones de seguridad automáticas
apt-get install -y unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades

# Carpetas
mkdir -p /opt/proxy/sites /opt/pyr/prod/backups /opt/pyr/dev
chown -R deploy:deploy /opt/proxy /opt/pyr
```

> Los contenedores escriben los backups como root dentro de `/opt/pyr/prod/backups`; está bien que el dueño de la carpeta sea `deploy`.

### Cambiar los dominios más adelante

Para pasar de `sslip.io`/`nip.io` a un dominio propio (o cambiar de dominio), con los registros DNS ya creados:

```bash
scp scripts/vps-domain.sh deploy@IP:~/
ssh deploy@IP
bash vps-domain.sh midominio.com.ar            # staging queda en dev.midominio.com.ar
```

Verifica que los nombres apunten a la VPS, reescribe `sites/pyr.caddy` (si `www.` también apunta, lo redirige al dominio principal), actualiza `APP_URL`/`BETTER_AUTH_URL` de prod y dev, recarga Caddy y recrea `web`/`worker` de los entornos que estén corriendo. Guarda copia de lo anterior en `/opt/pyr/domain-backups/`.

## 2. DNS

Crear registros **A** (y AAAA si hay IPv6) apuntando a la IP de la VPS:

- `trivia.midominio.com`
- `dev.trivia.midominio.com`
- opcional `www.trivia.midominio.com` (se redirige al principal)

Con Cloudflare: registros en modo **DNS only** (nube gris). Con el proxy naranja Caddy no puede emitir los certificados como está configurado.

## 3. Reverse proxy compartido (Caddy)

Como `deploy`, copiar `infra/proxy/compose.yml`, `infra/proxy/Caddyfile` e `infra/proxy/sites/pyr.caddy` a `/opt/proxy/` (respetando `sites/`), y **editar los dominios** en `sites/pyr.caddy`.

```bash
docker network create proxy
cd /opt/proxy
echo "ACME_EMAIL=tu@email.com" > .env
docker compose up -d
```

Para sumar otra app en el futuro: crear `sites/otra-app.caddy` con su bloque `dominio { reverse_proxy contenedor:puerto }`, unir ese contenedor a la red `proxy` y recargar:

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## 4. Entornos de PyR

Para cada entorno (`prod` y `dev`):

```bash
cd /opt/pyr/prod            # o /opt/pyr/dev
# copiar docker/.env.example del repo como .env y completar:
nano .env
```

Valores que **cambian por entorno**:

| Variable | prod | dev (staging) |
|---|---|---|
| `PYR_PROXY_ALIAS` | `pyr-prod-web` | `pyr-dev-web` |
| `APP_URL` / `BETTER_AUTH_URL` | `https://trivia.midominio.com` | `https://dev.trivia.midominio.com` |
| `POSTGRES_PASSWORD` | una clave | **otra** clave |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | otro distinto |
| `SEED_DEMO` | `false` | `true` (datos de prueba en la primera carga) |
| `BACKUP_DIR` | `/opt/pyr/prod/backups` | — |

Login en el registro de imágenes (una vez; usar un *Personal Access Token* con permiso `read:packages`):

```bash
echo <TOKEN> | docker login ghcr.io -u <usuario-github> --password-stdin
```

El primer deploy lo hace GitHub Actions (paso 5). Para levantarlo a mano:

```bash
cd /opt/pyr/prod
docker compose -p pyr-prod -f compose.prod.yml --profile backup up -d
docker compose -p pyr-prod -f compose.prod.yml logs -f migrate web
```

## 5. CI/CD con GitHub Actions

- `.github/workflows/ci.yml`: en cada push/PR corre lint, typecheck, tests (Vitest con Postgres), build y E2E (Playwright).
- `.github/workflows/deploy.yml`: cuando el CI pasa en `dev` → despliega **staging**; en `main` → **producción**. Construye la imagen, la publica en GHCR con tag `<rama>-<sha>`, copia `compose.prod.yml` + scripts de backup a `/opt/pyr/<env>`, actualiza `PYR_TAG` en el `.env` y hace `pull` + `up -d`. Espera a que `web` quede *healthy*.

En GitHub → *Settings*:

1. **Environments**: crear `staging` y `production` (en `production` conviene exigir aprobación manual).
2. **Secrets** (a nivel repo o por environment): `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY` (clave privada cuyo público está en `/home/deploy/.ssh/authorized_keys`), opcional `VPS_PORT`.
3. Reemplazar `OWNER` en `docker/compose.prod.yml` no es necesario: el deploy setea `PYR_IMAGE` en el `.env`.

Flujo de trabajo: desarrollar en `dev` → push → se ve en `dev.trivia…` → PR `dev` → `main` → producción.

### Rollback

```bash
cd /opt/pyr/prod
sed -i 's/^PYR_TAG=.*/PYR_TAG=main-<sha-anterior>/' .env
docker compose -p pyr-prod -f compose.prod.yml --profile backup up -d
```

(Las migraciones de Prisma no se revierten solas: si una migración rompió algo, corregir con una migración nueva.)

## 6. Backups

El servicio `backup` (solo prod, `--profile backup`) hace `pg_dump` comprimido todos los días a las 03:30 (`BACKUP_CRON`) en `BACKUP_DIR` y borra los de más de `BACKUP_RETENTION_DAYS` días.

- Recomendado: sincronizar `/opt/pyr/prod/backups` fuera de la VPS (rclone a un bucket, o el snapshot del proveedor).
- Backup manual: `docker compose -p pyr-prod -f compose.prod.yml exec backup sh /usr/local/bin/backup.sh`
- **Restaurar** (detiene la app mientras tanto):

```bash
cd /opt/pyr/prod
docker compose -p pyr-prod -f compose.prod.yml stop web worker
gunzip -c backups/pyr-AAAAMMDD-HHMMSS.sql.gz | docker compose -p pyr-prod -f compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose -p pyr-prod -f compose.prod.yml up -d
```

Las imágenes subidas viven en el volumen `pyr-prod_uploads`; incluirlas en la copia externa (`docker run --rm -v pyr-prod_uploads:/d -v $PWD:/b alpine tar czf /b/uploads.tgz -C /d .`) o pasar a S3 (`STORAGE_DRIVER=s3`).

## 7. Operación

```bash
docker compose -p pyr-prod -f compose.prod.yml ps
docker compose -p pyr-prod -f compose.prod.yml logs -f --tail 100 web worker   # logs JSON (pino)
docker compose -p pyr-prod -f compose.prod.yml exec db psql -U pyr pyr         # consola SQL
docker compose -p pyr-prod -f compose.prod.yml run --rm migrate node dist/seed.mjs   # re-crear admin si se borró
```

## Probarlo en local antes de la VPS

```bash
docker build -t pyr:local .
docker network create proxy
# en una carpeta temporal: compose.prod.yml + backup/ + .env con PYR_IMAGE=pyr, PYR_TAG=local,
# APP_URL=https://pyr.localhost, y en el Caddyfile un sitio "pyr.localhost { tls internal; reverse_proxy pyr-prod-web:3000 }"
docker compose -p pyr-localprod -f compose.prod.yml --profile backup up -d
```
