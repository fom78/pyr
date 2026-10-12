import { fromDateTimeInput, toDateTimeInput } from "@/lib/format";

const DAY = 86_400_000;

export type ScheduleShape = {
  weekdays: number[]; // 0 = domingo … 6 = sábado
  timeOfDay: string; // "HH:mm"
  timezone: string;
};

export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Turnos del calendario en (from, until]: cada día de la semana elegido a la hora local indicada,
 * convertido al instante UTC correspondiente a la zona del calendario.
 */
export function upcomingSlots(schedule: ScheduleShape, from: Date, until: Date): Date[] {
  if (!schedule.weekdays.length || !TIME_OF_DAY.test(schedule.timeOfDay) || until <= from) return [];
  const days = new Set(schedule.weekdays);
  // Fecha calendario local de `from`; se recorre día por día como fechas puras (UTC a medianoche).
  const [y, m, d] = toDateTimeInput(from, schedule.timezone).slice(0, 10).split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const out: Date[] = [];
  const maxDays = Math.ceil((until.getTime() - from.getTime()) / DAY) + 2;
  for (let i = 0; i <= maxDays; i++) {
    const day = new Date(start + i * DAY);
    if (!days.has(day.getUTCDay())) continue;
    const at = fromDateTimeInput(`${day.toISOString().slice(0, 10)}T${schedule.timeOfDay}`, schedule.timezone);
    if (at > from && at <= until) out.push(at);
  }
  return out;
}
