import { TZDate } from "@date-fns/tz";
import { format, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";

export const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

/** Fechas: se guardan en UTC y se muestran en la zona del usuario. */
export function formatDate(d: Date | string, tz = DEFAULT_TZ, pattern = "d MMM yyyy") {
  return format(new TZDate(new Date(d), tz), pattern, { locale: es });
}

export function formatDateTime(d: Date | string, tz = DEFAULT_TZ) {
  return format(new TZDate(new Date(d), tz), "d MMM yyyy, HH:mm", { locale: es });
}

export function fromNow(d: Date | string) {
  const date = new Date(d);
  const s = formatDistanceToNowStrict(date, { locale: es });
  return date.getTime() > Date.now() ? `en ${s}` : `hace ${s}`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("es-AR").format(n);
}

export function formatMs(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
