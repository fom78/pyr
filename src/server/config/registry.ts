import { z } from "zod";

/**
 * Registro de parámetros de negocio configurables.
 * - El valor efectivo = override por categoría (si `categoryOverride`) > valor en DB (AppSetting) > default.
 * - El panel de admin genera el formulario a partir de este registro.
 * - Las reglas visibles ("Cómo se juega") leen estos valores: nunca hardcodear números en la UI.
 */
type Def<T extends z.ZodType> = {
  schema: T;
  default: z.infer<T>;
  label: string;
  help?: string;
  group: SettingGroup;
  categoryOverride?: boolean;
  /** Unidad para mostrar en el formulario. */
  unit?: string;
};

export type SettingGroup = "Liga" | "Cuestionarios" | "Puntaje" | "Juego" | "Créditos" | "Torneos" | "Moderación";

const int = (min: number, max: number) => z.number().int().min(min).max(max);

function def<T extends z.ZodType>(d: Def<T>) {
  return d;
}

export const settingsRegistry = {
  // ── Liga ──
  "lives.max": def({
    schema: int(1, 20),
    default: 3,
    label: "Vidas por usuario",
    help: "Cantidad máxima de categorías en las que un usuario puede participar a la vez.",
    group: "Liga",
  }),
  "league.leaveCooldownDays": def({
    schema: int(0, 90),
    default: 7,
    label: "Período de desvinculación",
    help: "Días que tarda en liberarse una vida después de abandonar una categoría.",
    group: "Liga",
    unit: "días",
  }),
  "league.rejoinBlockDays": def({
    schema: int(0, 365),
    default: 14,
    label: "Bloqueo para volver",
    help: "Días (desde que pidió salir) en que el usuario no puede volver a la misma categoría.",
    group: "Liga",
    unit: "días",
  }),
  "ranking.bestK": def({
    schema: int(1, 100),
    default: 5,
    label: "Mejores cuestionarios que suman (K)",
    help: "Para la tabla se suman los K mejores puntajes de cada usuario entre los cuestionarios computables.",
    group: "Liga",
    categoryOverride: true,
  }),
  "ranking.windowDays": def({
    schema: int(1, 365),
    default: 30,
    label: "Ventana del ranking",
    help: "Cuentan los cuestionarios vigentes y los cerrados computables cuyo cierre cae dentro de esta cantidad de días.",
    group: "Liga",
    categoryOverride: true,
    unit: "días",
  }),

  // ── Cuestionarios ──
  "quiz.frequencyDays": def({
    schema: int(1, 60),
    default: 3,
    label: "Frecuencia de publicación",
    help: "Cada cuántos días se publica un cuestionario nuevo en una categoría (sugerencia al programar).",
    group: "Cuestionarios",
    categoryOverride: true,
    unit: "días",
  }),
  "quiz.activeDays": def({
    schema: int(1, 60),
    default: 3,
    label: "Días jugable",
    help: "Duración por defecto del estado ACTIVO de un cuestionario.",
    group: "Cuestionarios",
    categoryOverride: true,
    unit: "días",
  }),
  "quiz.computableDays": def({
    schema: int(1, 365),
    default: 30,
    label: "Días computable",
    help: "Tiempo que un cuestionario cerrado sigue sumando para la tabla antes de pasar a no computable.",
    group: "Cuestionarios",
    categoryOverride: true,
    unit: "días",
  }),
  "quiz.questionCount": def({
    schema: int(1, 100),
    default: 10,
    label: "Preguntas por cuestionario",
    help: "Valor por defecto al crear un cuestionario.",
    group: "Cuestionarios",
  }),
  "quiz.timeLimitSec": def({
    schema: int(3, 3600),
    default: 20,
    label: "Tiempo por pregunta",
    help: "Valor por defecto al crear un cuestionario.",
    group: "Cuestionarios",
    unit: "seg",
  }),
  "review.revealAnswers": def({
    schema: z.enum(["ON_CLOSE", "ON_FINISH"]),
    default: "ON_CLOSE",
    label: "Mostrar respuestas correctas",
    help: "ON_CLOSE: recién cuando cierra el cuestionario (evita filtraciones). ON_FINISH: al terminar el intento.",
    group: "Cuestionarios",
  }),

  "questions.duplicateThreshold": def({
    schema: z.number().min(0.2).max(1),
    default: 0.55,
    label: "Umbral de posible duplicado",
    help: "Similitud de texto (0 a 1) a partir de la cual se avisa que una pregunta podría estar repetida.",
    group: "Cuestionarios",
  }),

  // ── Puntaje ──
  "scoring.base": def({
    schema: int(0, 10000),
    default: 100,
    label: "Puntos base por acierto",
    group: "Puntaje",
    categoryOverride: true,
    unit: "pts",
  }),
  "scoring.timeBonus": def({
    schema: int(0, 10000),
    default: 50,
    label: "Bonus máximo por velocidad",
    help: "Se suma bonus × (1 − tiempo usado / tiempo límite) en cada acierto.",
    group: "Puntaje",
    categoryOverride: true,
    unit: "pts",
  }),
  "scoring.wrongPenalty": def({
    schema: int(0, 10000),
    default: 0,
    label: "Penalización por error",
    help: "Puntos que se restan por respuesta incorrecta o sin responder (0 = desactivado).",
    group: "Puntaje",
    categoryOverride: true,
    unit: "pts",
  }),

  // ── Juego ──
  "game.latencyGraceMs": def({
    schema: int(0, 10000),
    default: 1500,
    label: "Tolerancia de latencia",
    help: "Margen que se le da a la red al validar que la respuesta llegó a tiempo.",
    group: "Juego",
    unit: "ms",
  }),
  "game.attemptGraceSec": def({
    schema: int(0, 600),
    default: 15,
    label: "Margen del intento",
    help: "Margen extra sobre la suma de tiempos para el límite global de un intento (modo por pregunta).",
    group: "Juego",
    unit: "seg",
  }),
  "game.answersPerMinute": def({
    schema: int(5, 1000),
    default: 60,
    label: "Respuestas por minuto (rate limit)",
    group: "Juego",
  }),

  // ── Créditos ──
  "credits.signupBonus": def({
    schema: int(0, 100000),
    default: 100,
    label: "Bono de bienvenida",
    group: "Créditos",
    unit: "créditos",
  }),
  "credits.quizCompleted": def({
    schema: int(0, 10000),
    default: 2,
    label: "Por cuestionario completado (liga)",
    group: "Créditos",
    unit: "créditos",
  }),
  "credits.goodPerformance": def({
    schema: int(0, 10000),
    default: 2,
    label: "Extra por buen desempeño",
    group: "Créditos",
    unit: "créditos",
  }),
  "credits.goodPerformanceRatio": def({
    schema: z.number().min(0).max(1),
    default: 0.8,
    label: "Umbral de buen desempeño",
    help: "Porcentaje de aciertos (0 a 1) a partir del cual se da el extra.",
    group: "Créditos",
  }),
  "credits.perfectBonus": def({
    schema: int(0, 10000),
    default: 5,
    label: "Extra por cuestionario perfecto",
    group: "Créditos",
    unit: "créditos",
  }),
  "credits.streakLength": def({
    schema: int(2, 100),
    default: 5,
    label: "Largo de racha",
    help: "Cantidad de cuestionarios seguidos de una categoría (sin saltear ninguno) para cobrar el bonus.",
    group: "Créditos",
  }),
  "credits.streakBonus": def({
    schema: int(0, 10000),
    default: 10,
    label: "Bonus por racha",
    group: "Créditos",
    unit: "créditos",
  }),

  // ── Torneos ──
  "tournament.wildcardsPerQuiz": def({
    schema: int(0, 3),
    default: 1,
    label: "Comodines por cuestionario (default)",
    group: "Torneos",
  }),

  // ── Moderación ──
  "mods.canBan": def({
    schema: z.boolean(),
    default: false,
    label: "Los moderadores pueden banear",
    group: "Moderación",
  }),
  "mods.canPublishQuizzes": def({
    schema: z.boolean(),
    default: true,
    label: "Los moderadores pueden publicar cuestionarios",
    group: "Moderación",
  }),
} as const;

export type SettingKey = keyof typeof settingsRegistry;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingsRegistry)[K]["schema"]> };

export const settingKeys = Object.keys(settingsRegistry) as SettingKey[];

export const categoryOverridableKeys = settingKeys.filter(
  (k) => (settingsRegistry[k] as { categoryOverride?: boolean }).categoryOverride,
);

export function defaultSettings(): Settings {
  const out = {} as Record<string, unknown>;
  for (const k of settingKeys) out[k] = settingsRegistry[k].default;
  return out as Settings;
}

/** Valida y normaliza un valor para una key. Lanza ZodError si es inválido. */
export function parseSetting<K extends SettingKey>(key: K, value: unknown): Settings[K] {
  return settingsRegistry[key].schema.parse(value) as Settings[K];
}

/** Aplica valores crudos (DB / overrides) sobre una base, ignorando keys desconocidas o inválidas. */
export function mergeSettings(base: Settings, raw: Record<string, unknown>, onlyKeys?: readonly SettingKey[]): Settings {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in settingsRegistry)) continue;
    if (onlyKeys && !onlyKeys.includes(k as SettingKey)) continue;
    const parsed = settingsRegistry[k as SettingKey].schema.safeParse(v);
    if (parsed.success) out[k] = parsed.data;
  }
  return out as Settings;
}
