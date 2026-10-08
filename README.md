# PyR — Preguntas y Respuestas

Competencia de trivia por categorías (liga con vidas y ranking de mejores K) y torneos con créditos y comodines.

## Requisitos
- Node.js 22+ (probado con 24)
- Docker (para Postgres local)

## Levantar en local
```bash
cp .env.example .env          # completar BETTER_AUTH_SECRET y ADMIN_PASSWORD
npm install
docker compose up -d          # Postgres en localhost:5440
npm run db:deploy             # aplica migraciones
npm run db:seed               # admin + datos de prueba
npm run dev                   # http://localhost:3200
npm run worker                # (otra terminal) tareas programadas
```

Usuarios de prueba: `moderador` / `Moderador123!` · `ana`, `beto`, `caro`, `dani`, `eli` / `Jugador123!` · admin según `.env`.

### Google (opcional)
Crear credenciales OAuth en Google Cloud Console con redirect URI `http://localhost:3200/api/auth/callback/google` y completar `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Si quedan vacías, el botón no aparece.

## Tests
```bash
npm test            # unit + integración (usa la base pyr_test)
npm run test:e2e    # Playwright (levanta la app)
```

## Despliegue
Ver [docs/deploy.md](docs/deploy.md) (VPS con Docker, Caddy compartido, entornos prod/dev, CI/CD y backups).
