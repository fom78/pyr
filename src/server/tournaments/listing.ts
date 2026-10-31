import { isQualifiersOnly, registrationState } from "./registration";

/**
 * Agrupado de `/torneos` (puro). Prioriza lo que el jugador puede hacer: los suyos siempre; de los
 * demás, primero los que todavía aceptan inscripción, recortados para no amontonar tarjetas.
 */

const HOUR = 3_600_000;

export type ListedTournament = {
  id: string;
  status: string;
  format: string;
  startsAt: Date;
  endsAt: Date;
  registrationOpensAt: Date;
  registrationEndsAt: Date;
  maxParticipants: number | null;
  qualifiers: { fromRank: number; topN: number }[];
};

export const LISTING_LIMITS = { joinable: 3, upcoming: 6 };

/** ¿Alguien que no está inscripto se puede anotar ahora? (Las eliminatorias por clasificación no.) */
export function openToAll(t: ListedTournament, now: Date) {
  return registrationState(t, now) === "OPEN" && !isQualifiersOnly(t);
}

const byTime = (key: "startsAt" | "endsAt" | "registrationEndsAt", dir: 1 | -1) => (a: ListedTournament, b: ListedTournament) =>
  dir * (a[key].getTime() - b[key].getTime());

export function groupTournaments<T extends ListedTournament>(list: T[], mine: Set<string>, now: Date, limits = LISTING_LIMITS) {
  const published = list.filter((t) => t.status === "PUBLISHED");
  const active = published.filter((t) => t.startsAt <= now && now < t.endsAt);
  const upcoming = published.filter((t) => t.startsAt > now);
  const isMine = (t: T) => mine.has(t.id);
  const others = (l: T[]) => l.filter((t) => !isMine(t));

  // En curso: los que juego (el que termina antes primero); para sumarse, el que empezó más recién.
  const activeMine = active.filter(isMine).sort(byTime("endsAt", 1));
  const joinable = others(active)
    .filter((t) => openToAll(t, now))
    .sort(byTime("startsAt", -1));
  const started = others(active)
    .filter((t) => !openToAll(t, now))
    .sort(byTime("startsAt", -1));

  // Próximos: con inscripción abierta (el que cierra antes primero) y después el resto por inicio.
  const upcomingMine = upcoming.filter(isMine).sort(byTime("startsAt", 1));
  const open = others(upcoming)
    .filter((t) => openToAll(t, now))
    .sort(byTime("registrationEndsAt", 1));
  const later = others(upcoming)
    .filter((t) => !openToAll(t, now))
    .sort(byTime("startsAt", 1));

  return {
    active: {
      mine: activeMine,
      joinable: joinable.slice(0, limits.joinable),
      /** Todos los de otros (para "Ver todos"): primero los que aceptan inscripción. */
      all: { joinable, started },
      hidden: joinable.length + started.length - Math.min(joinable.length, limits.joinable),
      total: active.length,
    },
    upcoming: {
      mine: upcomingMine,
      open: open.slice(0, limits.upcoming),
      later: later.slice(0, limits.upcoming),
      all: { open, later },
      hidden: Math.max(0, open.length - limits.upcoming) + Math.max(0, later.length - limits.upcoming),
      total: upcoming.length,
    },
    /** Mis torneos: los que estoy jugando primero, después los próximos. */
    mine: [...activeMine, ...upcomingMine],
  };
}

/** Fecha (o ronda) que se está jugando: 1…quizCount según `frequencyHours`. */
export function currentRound(t: { startsAt: Date; frequencyHours: number; quizCount: number }, now: Date) {
  if (now < t.startsAt) return 0;
  return Math.min(t.quizCount, Math.floor((now.getTime() - t.startsAt.getTime()) / (t.frequencyHours * HOUR)) + 1);
}

/** Pestaña por defecto: mis torneos si tengo; si no, en curso si hay algo para sumarse; si no, próximos. */
export function defaultTab(g: ReturnType<typeof groupTournaments>) {
  if (g.mine.length) return "mios" as const;
  if (g.active.joinable.length) return "curso" as const;
  return "proximos" as const;
}
