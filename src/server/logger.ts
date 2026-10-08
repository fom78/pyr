import pino from "pino";

// Logs estructurados (JSON). En desarrollo se pueden embellecer con `| npx pino-pretty`.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { app: "pyr", proc: process.env.PYR_PROCESS ?? (/worker/.test(process.argv[1] ?? "") ? "worker" : "web") },
  redact: ["password", "*.password", "headers.cookie", "headers.authorization"],
});
