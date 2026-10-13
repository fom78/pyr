import { describe, expect, it } from "vitest";
import { afterFeedback, afterReopen, allowedTicketActions, canTicket, MAX_ROUNDS, safePageUrl, type TicketState } from "@/server/tickets/rules";

const author = { id: "u", staff: false };
const mod = { id: "m", staff: true };
const other = { id: "o", staff: true };
const t = (p: Partial<TicketState> = {}): TicketState => ({ status: "OPEN", userId: "u", assigneeId: null, rounds: 0, ...p });

describe("tickets: reglas", () => {
  it("el staff toma un ticket sin tomar; el autor solo puede dar feedback", () => {
    expect(allowedTicketActions(t(), mod)).toEqual(["take", "note", "close"]);
    expect(allowedTicketActions(t(), author)).toEqual([]);
    expect(canTicket(t(), { id: "x", staff: false }, "feedback")).toBe(false);
  });

  it("solo responde quien lo tomó, y hasta MAX_ROUNDS veces", () => {
    const mine = t({ status: "IN_PROGRESS", assigneeId: "m" });
    expect(canTicket(mine, mod, "answer")).toBe(true);
    expect(canTicket(mine, other, "answer")).toBe(false);
    expect(canTicket(mine, other, "take")).toBe(true); // se lo puede sacar (queda en el historial)
    expect(canTicket(mine, mod, "take")).toBe(false);
    expect(canTicket({ ...mine, rounds: MAX_ROUNDS }, mod, "answer")).toBe(false);
  });

  it("feedback una vez por respuesta: solo con el ticket respondido", () => {
    expect(canTicket(t({ status: "ANSWERED", rounds: 1 }), author, "feedback")).toBe(true);
    expect(canTicket(t({ status: "IN_PROGRESS", rounds: 1 }), author, "feedback")).toBe(false);
    expect(canTicket(t({ status: "ANSWERED", rounds: 1 }), mod, "feedback")).toBe(false);
  });

  it("'no se resolvió' vuelve al equipo hasta el tope de rondas; 'me sirvió' cierra", () => {
    expect(afterFeedback({ rounds: 1 }, true)).toBe("CLOSED");
    expect(afterFeedback({ rounds: 1 }, false)).toBe("IN_PROGRESS");
    expect(afterFeedback({ rounds: MAX_ROUNDS }, false)).toBe("CLOSED");
  });

  it("reabrir vuelve a quien lo tenía y deja al menos una respuesta", () => {
    expect(afterReopen({ assigneeId: "m", rounds: MAX_ROUNDS })).toEqual({ status: "IN_PROGRESS", rounds: MAX_ROUNDS - 1 });
    expect(afterReopen({ assigneeId: null, rounds: 0 })).toEqual({ status: "OPEN", rounds: 0 });
    expect(canTicket(t({ status: "CLOSED" }), mod, "reopen")).toBe(true);
    expect(canTicket(t({ status: "CLOSED" }), mod, "close")).toBe(false);
  });

  it("página de origen: solo rutas internas", () => {
    expect(safePageUrl("/categorias/historia")).toBe("/categorias/historia");
    expect(safePageUrl("//evil.com")).toBeNull();
    expect(safePageUrl("https://evil.com")).toBeNull();
    expect(safePageUrl(undefined)).toBeNull();
  });
});
