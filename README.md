# PyR — Preguntas y Respuestas

Competencia de trivia mobile-first:

- **Liga por categoría**: 3 vidas (= categorías simultáneas), un cuestionario cada pocos días, una sola oportunidad a contrarreloj, tabla con los **mejores K** resultados computables.
- **Torneos**: inscripción con créditos, todos los cuestionarios suman, comodines (doble total, doble por acierto, triple sorpresa) y premios.
- **Panel de admin/mod**: categorías, preguntas con revisión y buscador, importación Excel, cuestionarios (copiar, publicar, anular, recalcular), torneos, usuarios y baneos, configuración global, auditoría.

Stack: Next.js 16 · TypeScript · PostgreSQL 17 · Prisma 7 · Better Auth · Tailwind 4 + shadcn/ui · pg-boss · Vitest · Playwright · Docker + Caddy.

## Requisitos
- Node.js 22+ (probado con 24)
- Docker

## Levantar en local

**Todo de una** (Git Bash, WSL, Linux o macOS): `bash scripts/dev.sh` (o `npm run dev:all`). Verifica requisitos, crea el `.env`, instala dependencias, levanta Postgres, migra, corre el seed y arranca app + worker. Opciones: `--sin-worker`, `--solo-preparar`, `--tests`.

Paso a paso (en Windows PowerShell 5 usá un comando por línea; no soporta `&&`):
```bash
cp .env.example .env          # completar BETTER_AUTH_SECRET y ADMIN_PASSWORD
npm install
docker compose up -d          # Postgres en localhost:5440 (+ base pyr_test)
npm run db:deploy             # aplica migraciones
npm run db:seed               # admin + datos de prueba
npm run dev                   # http://localhost:3200
npm run worker                # (otra terminal) tareas programadas: cierres, tablas, torneos
```

Usuarios de prueba: `moderador` / `Moderador123!` · `ana`, `beto`, `caro`, `dani`, `eli` / `Jugador123!` (eli está baneado) · admin según `.env`.

### Google (opcional)
Crear credenciales OAuth en Google Cloud Console con redirect URI `http://localhost:3200/api/auth/callback/google` (y la de cada dominio) y completar `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Si quedan vacías, el botón no aparece.

## Tests
```bash
npm test            # unit + integración (usa la base pyr_test)
npm run test:e2e    # Playwright: juego completo con recarga e inscripción a torneo con comodín
npm run lint && npm run typecheck
```

## Despliegue
VPS con Docker, Caddy compartido (HTTPS automático, apto para más apps), entornos `main` → producción y `dev` → staging con bases separadas, CI/CD con GitHub Actions y backups diarios: ver **[docs/deploy.md](docs/deploy.md)**.

Más detalles de arquitectura y convenciones: [CLAUDE.md](CLAUDE.md).
