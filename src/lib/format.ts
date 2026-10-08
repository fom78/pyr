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

/** Valor para <input type="datetime-local"> en la zona del usuario. */
export function toDateTimeInput(d: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!d) return "";
  return format(new TZDate(new Date(d), tz), "yyyy-MM-dd'T'HH:mm");
}

/** Interpreta el valor de un datetime-local como hora local de `tz` y devuelve el instante UTC. */
export function fromDateTimeInput(v: string, tz = DEFAULT_TZ): Date {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, tz).getTime());
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
