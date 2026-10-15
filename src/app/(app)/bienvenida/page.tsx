import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { rulesFromSettings } from "@/server/rules/view";
import { prisma } from "@/server/db";
import { isNewAccount } from "@/server/auth/username";
import { UsernameForm } from "../perfil/forms";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function WelcomePage() {
  const user = await requireUser();
  const r = rulesFromSettings(await getSettings());
  // Alta con Google: el usuario se armó solo; se lo mostramos para que lo cambie si quiere.
  const [hasPassword, account] = await Promise.all([
    prisma.account.count({ where: { userId: user.id, providerId: "credential" } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } }),
  ]);
  // Cuenta nueva (no depende de si ya lo cambió: así el paso no desaparece al guardar).
  const isNew = isNewAccount(account.createdAt);
  const usernameStep =
    !hasPassword && isNew && user.username
      ? [
          {
            emoji: "🪪",
            title: `Tu usuario es @${user.username}`,
            body: "Así te van a ver en las tablas. Lo armamos con tu cuenta de Google: si querés otro, cambialo ahora (después también podés desde tu perfil).",
            extra: <UsernameForm username={user.username} submitLabel="Guardar" hint="Letras, números, guion bajo o punto." />,
          },
        ]
      : [];
  return (
    <Onboarding
      name={user.name}
      steps={[
        {
          emoji: "🧠",
          title: `¡Bienvenido/a, ${user.name}!`,
          body: "PyR es una competencia de preguntas y respuestas. Respondé rápido y bien para subir en las tablas.",
        },
        ...usernameStep,
        {
          emoji: "❤️",
          title: `Tenés ${r.lives} vidas`,
          body: `Cada vida es una categoría en la que participás (fútbol, cine, países…). Si querés cambiar, podés abandonar una: la vida se libera a los ${r.leaveCooldownDays} días.`,
        },
        {
          emoji: "⏱️",
          title: "Un intento, a contrarreloj",
          body: `Cada pocos días sale un cuestionario nuevo. Lo jugás una sola vez: cada acierto vale ${r.scoring.base} puntos + hasta ${r.scoring.timeBonus} por velocidad. El reloj no se detiene aunque cierres la app.`,
        },
        {
          emoji: "🏆",
          title: `Tus mejores ${r.bestK} cuentan`,
          body: `En cada categoría suman tus ${r.bestK} mejores resultados recientes. También hay torneos que se pagan con créditos: ya tenés ${r.credits.signup} de regalo.`,
        },
      ]}
    />
  );
}
