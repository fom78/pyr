/**
 * Textos introductorios editables por el admin (sección "Cómo se juega").
 * Son prosa: los números (vidas, días, puntos, K…) se muestran aparte y siempre salen de la configuración.
 */
export const rulesSections = {
  intro: "Introducción",
  league: "Modo liga (por categoría)",
  tournament: "Modo torneo",
  credits: "Créditos",
} as const;

export type RulesSection = keyof typeof rulesSections;

export const defaultRulesTexts: Record<RulesSection, string> = {
  intro:
    "PyR es una competencia de preguntas y respuestas. Elegís tus categorías favoritas, respondés cuestionarios a contrarreloj y competís en tablas de posiciones. También podés anotarte en torneos especiales.",
  league:
    "En cada categoría se publican cuestionarios cada pocos días. Cada uno se puede jugar una sola vez mientras está vigente. Apenas terminás uno, tu puntaje se refleja en la tabla de la categoría, donde suman tus mejores resultados recientes: siempre hay revancha.",
  tournament:
    "Los torneos tienen fechas, reglamento y premios propios. Se paga la inscripción con créditos (no gasta vidas) y suman todos los cuestionarios del torneo. Podés usar comodines para multiplicar tus puntos.",
  credits:
    "Los créditos son la moneda del juego: no tienen valor real. Se ganan jugando y se usan para inscribirse en torneos.",
};
