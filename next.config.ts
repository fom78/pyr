import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App casi 100% personalizada por usuario: usamos el modelo de render dinámico clásico
  // (sin Cache Components). Ver decisión en CLAUDE.md.
  cacheComponents: false,
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pino", "pino-pretty", "pg-boss", "exceljs", "sharp"],
  experimental: {
    authInterrupts: true, // habilita forbidden() / unauthorized()
    serverActions: { bodySizeLimit: "2mb" },
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
