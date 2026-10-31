import { formatDate } from "@/lib/format";

/**
 * Filtros y agrupado de "Por aprobar" (puro). Con muchos borradores hay que poder ir directo a lo que
 * importa: lo urgente, lo incompleto, una categoría o un torneo, o lo que abre en los próximos días.
 */

const HOUR = 3_600_000;

export type PendingDraft = {
  id: string;
  title: string;
  opensAt: Date;
  category: { id: string; name: string; icon: string | null };
  tournament: boolean;
  questions: number;
  expected: number;
  reused: number;
  urgent: boolean;
  autoPublishAt: Date | null;
};

export const PENDING_STATES = {
  urgentes: "Urgentes",
  incompletos: "Incompletos",
  reutilizadas: "Con reutilizadas",
  listos: "Listos para aprobar",
} as const;
export type PendingState = keyof typeof PENDING_STATES;

export const PENDING_WINDOWS = { "24": "Próximas 24 h", "72": "Próximos 3 días", "168": "Próxima semana" } as const;

export type PendingFilters = {
  q?: string;
  origin?: "liga" | "torneo";
  owner?: string;
  state?: PendingState;
  /** Solo los que abren dentro de estas horas. */
  within?: number;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export function parsePendingFilters(sp: Record<string, string | string[] | undefined>): PendingFilters {
  const origin = one(sp.origen);
  const state = one(sp.estado);
  const within = one(sp.abre);
  return {
    q: one(sp.q),
    origin: origin === "liga" || origin === "torneo" ? origin : undefined,
    owner: one(sp.de),
    state: state && state in PENDING_STATES ? (state as PendingState) : undefined,
    within: within && within in PENDING_WINDOWS ? Number(within) : undefined,
  };
}

export const isComplete = (d: PendingDraft) => d.questions >= d.expected;

export function matchesState(d: PendingDraft, state: PendingState) {
  if (state === "urgentes") return d.urgent;
  if (state === "incompletos") return !isComplete(d);
  if (state === "reutilizadas") return d.reused > 0;
  return isComplete(d);
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Aplica todos los filtros menos el de estado (así los contadores de estado reflejan el resto del filtro). */
export function filterPendingBase(list: PendingDraft[], f: PendingFilters, now: Date) {
  const q = f.q ? norm(f.q) : null;
  return list.filter(
    (d) =>
      (!f.origin || d.tournament === (f.origin === "torneo")) &&
      (!f.owner || d.category.id === f.owner) &&
      (!f.within || d.opensAt.getTime() - now.getTime() <= f.within * HOUR) &&
      (!q || norm(`${d.title} ${d.category.name}`).includes(q)),
  );
}

export function filterPending(list: PendingDraft[], f: PendingFilters, now: Date) {
  const base = filterPendingBase(list, f, now);
  return f.state ? base.filter((d) => matchesState(d, f.state!)) : base;
}

export function countByState(list: PendingDraft[]) {
  const out = { total: list.length } as Record<PendingState | "total", number>;
  for (const s of Object.keys(PENDING_STATES) as PendingState[]) out[s] = list.filter((d) => matchesState(d, s)).length;
  return out;
}

/** Categorías y torneos que tienen borradores pendientes (para el selector "De"). */
export function pendingOwners(list: PendingDraft[]) {
  const map = new Map<string, PendingDraft["category"] & { tournament: boolean; count: number }>();
  for (const d of list) {
    const o = map.get(d.category.id);
    if (o) o.count++;
    else map.set(d.category.id, { ...d.category, tournament: d.tournament, count: 1 });
  }
  return [...map.values()].sort((a, b) => Number(a.tournament) - Number(b.tournament) || a.name.localeCompare(b.name, "es"));
}

/** Agrupa por día local de apertura (la lista ya viene ordenada por apertura). */
export function groupByDay(list: PendingDraft[], tz: string) {
  const groups: { day: string; items: PendingDraft[] }[] = [];
  for (const d of list) {
    const day = formatDate(d.opensAt, tz, "yyyy-MM-dd");
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(d);
    else groups.push({ day, items: [d] });
  }
  return groups;
}
