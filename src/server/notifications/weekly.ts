import { localWeekday } from "@/server/autoquiz/slots";
import { DEFAULT_TZ } from "@/lib/format";

/** Resumen semanal del jugador (puro): una línea por categoría en la que participa. */
export type WeeklyCategoryStats = {
  name: string;
  icon: string | null;
  rank: number | null;
  ranked: number;
  streak: number;
  played: number;
  bestScore: number | null;
};

const fmt = (n: number) => new Intl.NumberFormat("es-AR").format(n);

export function weeklySummaryLine(c: WeeklyCategoryStats) {
  const parts = [c.rank ? `puesto #${c.rank} de ${c.ranked}` : "sin puesto todavía"];
  if (c.streak >= 2) parts.push(`racha de ${c.streak}`);
  parts.push(
    c.played
      ? `${c.played} ${c.played === 1 ? "jugado" : "jugados"}, mejor ${fmt(c.bestScore ?? 0)} pts`
      : "no jugaste esta semana",
  );
  return `${c.icon ? `${c.icon} ` : ""}${c.name}: ${parts.join(" · ")}`;
}

export function weeklySummaryBody(list: WeeklyCategoryStats[]) {
  return list.map(weeklySummaryLine).join("\n");
}

/** Lunes (UTC) de la semana de `now`: un resumen por semana. */
export function weekKey(now: Date) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * El resumen sale los lunes (hora local). El worker corre todas las tareas al arrancar: sin esto,
 * un reinicio cualquier día de la semana lo mandaría ese día.
 */
export function isSummaryDay(now: Date, tz = DEFAULT_TZ) {
  return localWeekday(now, tz) === 1;
}
