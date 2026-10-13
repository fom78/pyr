/**
 * Reglas de los tickets de soporte (puras). No es un chat: el equipo responde y el autor da un
 * feedback por respuesta ("Me sirvió" / "No se resolvió" + comentario opcional). "No se resolvió"
 * vuelve el ticket al equipo hasta `MAX_ROUNDS` respuestas; después se cierra.
 */
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
export type TicketType = "BUG" | "SUGGESTION" | "OTHER";
export type TicketAction = "take" | "release" | "answer" | "feedback" | "note" | "close" | "reopen";

export const MAX_ROUNDS = 3;
export const AUTO_CLOSE_DAYS = 7;
export const DAILY_LIMIT = 5;

export const TYPE_LABEL: Record<TicketType, string> = { BUG: "Error", SUGGESTION: "Sugerencia", OTHER: "Otro" };
export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Sin tomar",
  IN_PROGRESS: "En curso",
  ANSWERED: "Respondido",
  CLOSED: "Cerrado",
};
/** Estado visto por el autor (no le importa si alguien lo tomó). */
export const USER_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Recibido",
  IN_PROGRESS: "En revisión",
  ANSWERED: "Respondido",
  CLOSED: "Cerrado",
};

export type TicketState = { status: TicketStatus; userId: string; assigneeId: string | null; rounds: number };
/** `staff` = puede atender tickets (`can(actor, "ticket.manage")`). */
export type TicketViewer = { id: string; staff: boolean };

export function canTicket(t: TicketState, v: TicketViewer, action: TicketAction): boolean {
  switch (action) {
    case "take":
      return v.staff && (t.status === "OPEN" || t.status === "IN_PROGRESS") && t.assigneeId !== v.id;
    case "release":
      return v.staff && t.status === "IN_PROGRESS" && t.assigneeId === v.id;
    case "answer":
      return v.staff && t.status === "IN_PROGRESS" && t.assigneeId === v.id && t.rounds < MAX_ROUNDS;
    case "feedback":
      // El estado ANSWERED se va con el feedback: uno por respuesta.
      return t.userId === v.id && t.status === "ANSWERED";
    case "note":
      return v.staff;
    case "close":
      return v.staff && t.status !== "CLOSED";
    case "reopen":
      return v.staff && t.status === "CLOSED";
  }
}

export function allowedTicketActions(t: TicketState, v: TicketViewer): TicketAction[] {
  return (["take", "release", "answer", "feedback", "note", "close", "reopen"] as const).filter((a) => canTicket(t, v, a));
}

/** Estado después del feedback del autor. */
export function afterFeedback(t: Pick<TicketState, "rounds">, helpful: boolean): TicketStatus {
  if (helpful) return "CLOSED";
  return t.rounds >= MAX_ROUNDS ? "CLOSED" : "IN_PROGRESS";
}

/** Al reabrir: vuelve a quien lo tenía (o queda sin tomar) y siempre le queda al menos una respuesta. */
export function afterReopen(t: Pick<TicketState, "assigneeId" | "rounds">) {
  return { status: (t.assigneeId ? "IN_PROGRESS" : "OPEN") as TicketStatus, rounds: Math.min(t.rounds, MAX_ROUNDS - 1) };
}

/** Página desde la que se reportó: solo rutas internas, sin query de más. */
export function safePageUrl(raw: string | null | undefined) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw.slice(0, 300);
}
