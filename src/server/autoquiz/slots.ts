import { fromDateTimeInput, toDateTimeInput } from "@/lib/format";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Tope de turnos por consulta (1 por hora durante más de un año). */
const MAX_SLOTS = 10_000;

export type ScheduleShape = {
  anchorAt: Date; // turno 0
  frequencyHours: number;
  excludedWeekdays: number[]; // 0 = domingo … 6 = sábado, en `timezone`
  timezone: string;
};

export type Slot = { at: Date; excluded: boolean };

export const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Día de la semana local (0 = domingo) de un instante en la zona dada. */
export function localWeekday(at: Date, tz: string) {
  const [y, m, d] = toDateTimeInput(at, tz).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma (o resta) días de calendario manteniendo la hora local en la zona dada. */
export function addLocalDays(at: Date, days: number, tz: string) {
  const local = toDateTimeInput(at, tz);
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  return fromDateTimeInput(`${new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10)}T${local.slice(11, 16)}`, tz);
}

/**
 * Grilla de turnos en (from, until]: turno N = anchorAt + N × frequencyHours (N ≥ 0).
 * Con frecuencias múltiplo de 24 se avanza por días locales, así el turno queda siempre a la
 * misma hora de pared aunque la zona cambie de horario; si no, en horas absolutas.
 * Los turnos que caen en un día excluido se devuelven marcados (la grilla no se corre).
 */
export function gridSlots(s: ScheduleShape, from: Date, until: Date): Slot[] {
  const freq = s.frequencyHours;
  if (!Number.isInteger(freq) || freq < 1 || until <= from || Number.isNaN(s.anchorAt.getTime())) return [];
  const excluded = new Set(s.excludedWeekdays);
  let at: (n: number) => Date;
  if (freq % 24 === 0) {
    const local = toDateTimeInput(s.anchorAt, s.timezone);
    const [y, m, d] = local.slice(0, 10).split("-").map(Number);
    const day0 = Date.UTC(y, m - 1, d);
    const time = local.slice(11, 16);
    const stepDays = freq / 24;
    at = (n) => fromDateTimeInput(`${new Date(day0 + n * stepDays * DAY).toISOString().slice(0, 10)}T${time}`, s.timezone);
  } else {
    at = (n) => new Date(s.anchorAt.getTime() + n * freq * HOUR);
  }
  // Primer turno posterior a `from` (se arranca un poco antes por si hubo cambio de horario).
  let n = Math.max(0, Math.floor((from.getTime() - s.anchorAt.getTime()) / (freq * HOUR)) - 1);
  while (at(n) <= from) n++;
  const out: Slot[] = [];
  for (let d = at(n); d <= until && out.length < MAX_SLOTS; d = at(++n)) {
    out.push({ at: d, excluded: excluded.has(localWeekday(d, s.timezone)) });
  }
  return out;
}

/** Turnos publicables en (from, until]: la grilla sin los días excluidos. */
export function upcomingSlots(s: ScheduleShape, from: Date, until: Date): Date[] {
  return gridSlots(s, from, until)
    .filter((x) => !x.excluded)
    .map((x) => x.at);
}

/** Texto corto para jugadores: "todos los días salvo dom", "cada 12 h", "cada 2 días". */
export function describeCadence(s: Pick<ScheduleShape, "frequencyHours" | "excludedWeekdays">) {
  const base =
    s.frequencyHours === 24
      ? "todos los días"
      : s.frequencyHours % 24 === 0
        ? `cada ${s.frequencyHours / 24} días`
        : `cada ${s.frequencyHours} h`;
  const excluded = [1, 2, 3, 4, 5, 6, 0].filter((d) => s.excludedWeekdays.includes(d)).map((d) => WEEKDAY_SHORT[d]);
  if (!excluded.length) return base;
  return `${base} salvo ${excluded.length > 1 ? `${excluded.slice(0, -1).join(", ")} y ${excluded.at(-1)}` : excluded[0]}`;
}
