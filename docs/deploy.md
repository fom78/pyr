# Despliegue en la VPS

Arquitectura en la VPS (pensada para convivir con otras apps):

```
Internet ─► Caddy (stack "proxy", puertos 80/443, HTTPS automático)
              ├─ trivia.midominio.com      → pyr-prod-web:3000   (stack pyr-prod: web, worker, db)
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

Verifica que los nombres apunten a la VPS, reescribe `sites/pyr.caddy` (si `www.` también apunta, lo redirige al dominio principal), actualiza `APP_URL`/`BETTER_AUTH_URL` de prod y dev, recarga Caddy y recrea `web`/`worker` de los entornos que estén corriendo. Guarda copia de lo anterior en `~/pyr-domain-backups/`.

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
| `APP_ENV` | `prod` | `dev` |
| `BACKUP_DIR` | `/opt/pyr/prod/backups` | `/opt/pyr/dev/backups` |

Login en el registro de imágenes (una vez; usar un *Personal Access Token* con permiso `read:packages`):

```bash
echo <TOKEN> | docker login ghcr.io -u <usuario-github> --password-stdin
```

El primer deploy lo hace GitHub Actions (paso 5). Para levantarlo a mano:

```bash
cd /opt/pyr/prod
docker compose -p pyr-prod -f compose.prod.yml up -d
docker compose -p pyr-prod -f compose.prod.yml logs -f migrate web
```

## 5. CI/CD con GitHub Actions

- `.github/workflows/ci.yml`: en cada push/PR corre lint, typecheck, tests (Vitest con Postgres), build y E2E (Playwright).
- `.github/workflows/deploy.yml`: cuando el CI pasa en `dev` → despliega **staging**; en `main` → **producción**. Construye la imagen, la publica en GHCR con tag `<rama>-<sha>`, copia `compose.prod.yml` a `/opt/pyr/<env>`, actualiza `PYR_TAG` en el `.env` y hace `pull` + `up -d`. Espera a que `web` quede *healthy*.

En GitHub → *Settings*:

1. **Environments**: crear `staging` y `production` (en `production` conviene exigir aprobación manual).
2. **Secrets** (a nivel repo o por environment): `VPS_HOST`, `VPS_USER` (`deploy`), `VPS_SSH_KEY` (clave privada cuyo público está en `/home/deploy/.ssh/authorized_keys`), opcional `VPS_PORT`.
3. Reemplazar `OWNER` en `docker/compose.prod.yml` no es necesario: el deploy setea `PYR_IMAGE` en el `.env`.

Flujo de trabajo: desarrollar en `dev` → push → se ve en `dev.trivia…` → PR `dev` → `main` → producción.

### Rollback

```bash
cd /opt/pyr/prod
sed -i 's/^PYR_TAG=.*/PYR_TAG=main-<sha-anterior>/' .env
docker compose -p pyr-prod -f compose.prod.yml up -d
```

(Las migraciones de Prisma no se revierten solas: si una migración rompió algo, corregir con una migración nueva.)

## 6. Backups

Los hace el **worker** en cada entorno (prod y staging): la base (`pg_dump` → `.sql.gz`) y, con storage local, las imágenes subidas (`-uploads.tar.gz`).

- **Diario** a las 03:30 (tarea `backup-nightly`) y **a pedido** desde el panel: **Backups → Crear backup ahora** (solo admins). Se descargan desde la misma página.
- Quedan en `BACKUP_DIR` del host (`/opt/pyr/<env>/backups`, montado en `/app/backups`). Se borran los de más de `BACKUP_RETENTION_DAYS` días (los manuales duran el doble).
- Nombre: `pyr-<APP_ENV>-AAAAMMDD-HHMMSS.sql.gz` (hora de Buenos Aires). Si falta `APP_ENV` se deduce del dominio.
- La carpeta tiene que ser escribible por el uid 1000 (usuario `node` de la imagen): `sudo chown 1000:deploy /opt/pyr/<env>/backups && sudo chmod 775 /opt/pyr/<env>/backups` (`vps-setup.sh` ya lo deja así).
- Si un backup falla, los admins reciben un aviso CRITICAL en el panel.

**Traerlo a la PC** (con `PYR_SSH=deploy@<vps>` en `.env.local`):

```bash
bash scripts/backup-pull.sh prod                     # último backup → ./backups/prod/
bash scripts/backup-pull.sh dev --images             # staging, con imágenes
bash scripts/backup-pull.sh prod --images --restore  # y lo carga en la base local (pide confirmación y guarda una copia antes)
```

**Restaurar en la VPS** (detiene la app mientras tanto):

```bash
cd /opt/pyr/prod
docker compose -p pyr-prod -f compose.prod.yml stop web worker
gunzip -c backups/pyr-prod-AAAAMMDD-HHMMSS.sql.gz | docker compose -p pyr-prod -f compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
# imágenes (opcional): docker run --rm -v pyr-prod_uploads:/d -v $PWD/backups:/b alpine tar xzf /b/pyr-prod-AAAAMMDD-HHMMSS-uploads.tar.gz -C /d
docker compose -p pyr-prod -f compose.prod.yml up -d
```

Recomendado además: copiar `/opt/pyr/prod/backups` fuera de la VPS (rclone a un bucket, o el snapshot del proveedor), o pasar las imágenes a S3 (`STORAGE_DRIVER=s3`; entonces el backup es solo la base).

> Antes el backup lo hacía un contenedor aparte (`backup`, `--profile backup`). Ya no existe: el deploy lo elimina solo (`--remove-orphans`). En una VPS ya instalada, agregar `APP_ENV=prod` / `APP_ENV=dev` al `.env` de cada entorno y ajustar el dueño de la carpeta de backups como se indica arriba.

## 7. Ingreso con Google

El ingreso con usuario y contraseña funciona siempre. El de Google se activa solo cuando el entorno tiene `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`; si faltan, el botón no aparece.

**Una sola vez, en https://console.cloud.google.com:**

1. Crear el proyecto (por ejemplo "PyR").
2. **APIs y servicios → Pantalla de consentimiento de OAuth:**
   - tipo **Externo**;
   - nombre "PyR" y mail de soporte;
   - dominio autorizado `pyrtrivia.com.ar`;
   - página principal `https://pyrtrivia.com.ar` y política de privacidad `https://pyrtrivia.com.ar/privacidad`;
   - permisos solo `openid`, `email` y `profile` (los básicos, sin verificación de Google);
   - **publicar la app ("En producción")**: en modo "Prueba" solo entran los mails cargados como testers.
3. **Credenciales → Crear ID de cliente de OAuth → Aplicación web.** Un mismo cliente sirve para todos los entornos.
   - **Orígenes de JavaScript autorizados:** `https://pyrtrivia.com.ar`, `https://dev.pyrtrivia.com.ar`, `http://localhost:3200`.
   - **URIs de redireccionamiento autorizados:**
     - `https://pyrtrivia.com.ar/api/auth/callback/google`
     - `https://dev.pyrtrivia.com.ar/api/auth/callback/google`
     - `http://localhost:3200/api/auth/callback/google`

     Agregá también la versión con `www.` si se usa.

En la VPS lo hace `bash scripts/vps-google.sh [dev|prod] [--reiniciar]`: pide las claves y las carga en los `.env`. A mano:

**En cada entorno** (`.env` local, `/opt/pyr/dev/.env`, `/opt/pyr/prod/.env`):

```bash
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
```

Después reiniciá la app (`docker compose -p pyr-<env> -f compose.prod.yml up -d`; en local, `npm run dev`). La URL de retorno se arma con `BETTER_AUTH_URL` (o `APP_URL`), que tiene que ser exactamente el dominio público.

**Cómo funciona:**
- **Primera vez con Google:** crea la cuenta con un usuario automático armado a partir del mail (lo puede cambiar en la bienvenida o el perfil) y lleva a la bienvenida.
- **Mismo mail:** si ya existía una cuenta con ese mail, se vincula sola.
- **Cuentas creadas sin mail:** conviene vincular Google desde el perfil, para no terminar con una cuenta duplicada.
- **Desde el perfil se puede:**
  - crear una contraseña, si se entró solo con Google;
  - desvincular Google, solo si la cuenta tiene contraseña.

## 8. Operación

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
# en una carpeta temporal: compose.prod.yml + .env con PYR_IMAGE=pyr, PYR_TAG=local,
# APP_URL=https://pyr.localhost, y en el Caddyfile un sitio "pyr.localhost { tls internal; reverse_proxy pyr-prod-web:3000 }"
docker compose -p pyr-localprod -f compose.prod.yml up -d
```
