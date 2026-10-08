import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { hash, verify } from "@node-rs/argon2";
import { APIError } from "better-auth/api";
import { prisma } from "@/server/db";
import { googleEnabled } from "@/server/env";
import { getActiveBan } from "@/server/users/bans";
import { grantSignupBonus } from "@/server/credits/rewards";
import { logger } from "@/server/logger";

export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

export const auth = betterAuth({
  appName: "PyR",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: (password) => hash(password),
      verify: ({ hash: h, password }) => verify(h, password),
    },
  },
  socialProviders: googleEnabled()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 días
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "USER" },
      timezone: { type: "string", input: false, defaultValue: "America/Argentina/Buenos_Aires" },
    },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" || process.env.RATE_LIMIT === "on",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/username": { window: 60, max: 8 },
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 600, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await grantSignupBonus(user.id);
          } catch (err) {
            logger.error({ err, userId: user.id }, "no se pudo otorgar el bono de bienvenida");
          }
        },
      },
    },
    session: {
      create: {
        // Un usuario baneado no puede iniciar sesión.
        before: async (session) => {
          const ban = await getActiveBan(session.userId);
          if (ban) {
            throw new APIError("FORBIDDEN", {
              message: ban.endsAt
                ? `Tu cuenta está suspendida hasta el ${ban.endsAt.toLocaleDateString("es-AR")}. Motivo: ${ban.reason}`
                : `Tu cuenta está suspendida. Motivo: ${ban.reason}`,
            });
          }
        },
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 24,
      usernameValidator: (u) => USERNAME_RE.test(u),
    }),
    nextCookies(), // debe ir último
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
