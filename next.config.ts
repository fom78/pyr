import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App casi 100% personalizada por usuario: usamos el modelo de render dinámico clásico
  // (sin Cache Components). Ver decisión en CLAUDE.md.
  cacheComponents: false,
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next", // E2E usa un directorio aparte para convivir con `npm run dev`
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pino", "pino-pretty", "pg-boss", "exceljs", "sharp"],
  experimental: {
    authInterrupts: true, // habilita forbidden() / unauthorized()
    serverActions: { bodySizeLimit: "2mb" },
    proxyClientMaxBodySize: "30mb", // importación Excel + zip de imágenes
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
