import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { rulesFromSettings } from "@/server/rules/view";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function WelcomePage() {
  const user = await requireUser();
  const r = rulesFromSettings(await getSettings());
  return (
    <Onboarding
      name={user.name}
      steps={[
        {
          emoji: "🧠",
          title: `¡Bienvenido/a, ${user.name}!`,
          body: "PyR es una competencia de preguntas y respuestas. Respondé rápido y bien para subir en las tablas.",
        },
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
