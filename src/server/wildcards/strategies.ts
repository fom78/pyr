import type { WildcardType } from "@/generated/prisma/enums";
import { NO_MULTIPLIER, type Multipliers, type ScoringSnapshot } from "@/server/scoring/scoring";

/**
 * Comodines como estrategias. Agregar uno nuevo = sumar el valor al enum WildcardType (schema.prisma)
 * y registrar aquí su estrategia; el motor de juego no cambia.
 */
export type WildcardInitContext = {
  questionCount: number;
  /** Entero aleatorio en [0, n). Inyectable para tests. */
  randomInt: (n: number) => number;
};

export type WildcardState = Record<string, unknown>;

/** Aviso que se muestra al servir una pregunta (ej. "esta vale el triple"). */
export type WildcardAnnouncement = { icon: string; title: string; text: string };

export interface WildcardStrategy {
  type: WildcardType;
  name: string;
  /** Explicación corta para la UI. */
  description: string;
  /** Ejemplo numérico generado con la config real. */
  example: (s: ScoringSnapshot) => string;
  /** Se ejecuta en el servidor al iniciar el intento. Lo que devuelve NO se envía al cliente hasta terminar. */
  init: (ctx: WildcardInitContext) => WildcardState;
  /** Multiplicadores para la respuesta en la posición `index` (0-based) del intento. */
  multipliers: (index: number, state: WildcardState) => Multipliers;
  /** Ajuste final sobre el total del intento. */
  finalize: (score: number, state: WildcardState) => number;
  /** Texto que se revela al terminar (ej. qué preguntas eran las sorpresa). */
  reveal: (state: WildcardState) => string | null;
  /** Aviso al servir la pregunta `index`. Solo se revela la pregunta actual, nunca las siguientes. */
  announce?: (index: number, state: WildcardState) => WildcardAnnouncement | null;
}

const doubleTotal: WildcardStrategy = {
  type: "DOUBLE_TOTAL",
  name: "Doble total",
  description: "Duplica el puntaje total que obtengas en el cuestionario.",
  example: (s) =>
    `Si sumás ${s.base * 7} puntos, con este comodín te quedan ${s.base * 14}.`,
  init: () => ({}),
  multipliers: () => NO_MULTIPLIER,
  // Si el total es negativo (penalizaciones) no se duplica la pérdida.
  finalize: (score) => (score > 0 ? score * 2 : score),
  reveal: () => null,
};

const doublePerCorrect: WildcardStrategy = {
  type: "DOUBLE_PER_CORRECT",
  name: "Doble por acierto",
  description: "Duplica los puntos base de cada respuesta correcta (el bonus por velocidad no se duplica).",
  example: (s) =>
    `Un acierto rápido vale ${s.base} + bonus; con este comodín vale ${s.base * 2} + el mismo bonus.`,
  init: () => ({}),
  multipliers: () => ({ base: 2, bonus: 1 }),
  finalize: (score) => score,
  reveal: () => null,
};

const SURPRISE_COUNT = 2;

const tripleSurprise: WildcardStrategy = {
  type: "TRIPLE_SURPRISE",
  name: "Triple sorpresa",
  description: `El sistema sortea ${SURPRISE_COUNT} preguntas: si las respondés bien, valen el triple. Te avisamos justo cuando te toca una.`,
  example: (s) =>
    `Si una de las preguntas sorpresa la acertás con ${s.base} + ${Math.round(s.timeBonus / 2)} de bonus, suma ${(s.base + Math.round(s.timeBonus / 2)) * 3}.`,
  init: ({ questionCount, randomInt }) => {
    const n = Math.min(SURPRISE_COUNT, questionCount);
    const pool = Array.from({ length: questionCount }, (_, i) => i);
    const picked: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = randomInt(pool.length);
      picked.push(pool.splice(j, 1)[0]);
    }
    return { indexes: picked.sort((a, b) => a - b) };
  },
  multipliers: (index, state) =>
    (state.indexes as number[] | undefined)?.includes(index) ? { base: 3, bonus: 3 } : NO_MULTIPLIER,
  finalize: (score) => score,
  reveal: (state) => {
    const idx = (state.indexes as number[] | undefined) ?? [];
    return idx.length ? `Preguntas sorpresa: ${idx.map((i) => `#${i + 1}`).join(" y ")}` : null;
  },
  announce: (index, state) =>
    (state.indexes as number[] | undefined)?.includes(index)
      ? { icon: "🃏", title: "¡Pregunta sorpresa!", text: "Si acertás, vale el triple." }
      : null,
};

export const wildcardStrategies: Record<WildcardType, WildcardStrategy> = {
  DOUBLE_TOTAL: doubleTotal,
  DOUBLE_PER_CORRECT: doublePerCorrect,
  TRIPLE_SURPRISE: tripleSurprise,
};

export function getStrategy(type: WildcardType): WildcardStrategy {
  const s = wildcardStrategies[type];
  if (!s) throw new Error(`Comodín desconocido: ${type}`);
  return s;
}
