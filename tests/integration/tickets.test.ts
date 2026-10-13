import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  addFeedback,
  addNote,
  answerTicket,
  autoCloseAnswered,
  closeTicket,
  createTicket,
  getTicket,
  reopenTicket,
  takeTicket,
} from "@/server/tickets/service";
import { MAX_ROUNDS } from "@/server/tickets/rules";
import { hasDb, makeUser, resetDb } from "./helpers";

const DAY = 86_400_000;
const input = { type: "BUG", title: "No carga la tabla", body: "Entro a la categoría y la tabla queda en blanco.", pageUrl: "/categorias/x" };

describe.skipIf(!hasDb)("tickets de soporte", () => {
  beforeEach(resetDb);

  async function setup() {
    const [admin, mod, ana, beto] = [await makeUser("ADMIN"), await makeUser("MOD"), await makeUser(), await makeUser()];
    const ticket = await createTicket(input, ana);
    return { admin, mod, ana, beto, ticket, staffMod: { id: mod.id, staff: true }, asAna: { id: ana.id, staff: false } };
  }

  it("ciclo completo: avisa al staff, se toma, se responde, 'no se resolvió', se responde de nuevo y 'me sirvió' lo cierra", async () => {
    const { mod, ana, ticket, staffMod, asAna } = await setup();
    const staffNotes = await prisma.notification.findMany({ where: { kind: "ticket.new" } });
    expect(staffNotes.map((n) => n.audience)).toEqual(["STAFF", "STAFF"]); // admin y mod, no jugadores
    expect(staffNotes[0].level).toBe("WARNING");

    await expect(answerTicket(ticket.id, staffMod, "Hola")).rejects.toThrow("primero tomá");
    await takeTicket(ticket.id, staffMod);
    await answerTicket(ticket.id, staffMod, "¿Probaste recargar?");
    expect(await prisma.notification.count({ where: { userId: ana.id, kind: "ticket.answered", audience: "PLAYER" } })).toBe(1);

    expect(await addFeedback(ticket.id, asAna, false, "Sigue igual")).toBe("IN_PROGRESS");
    const fb = await prisma.notification.findMany({ where: { kind: "ticket.feedback" } });
    expect(fb).toMatchObject([{ userId: mod.id, audience: "STAFF", level: "WARNING" }]); // solo a quien lo tiene
    await expect(addFeedback(ticket.id, asAna, true, null)).rejects.toThrow("no está esperando"); // uno por respuesta

    await answerTicket(ticket.id, staffMod, "Ya lo arreglamos.");
    expect(await addFeedback(ticket.id, asAna, true, "")).toBe("CLOSED");
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(t).toMatchObject({ status: "CLOSED", rounds: 2 });
    expect(t.closedAt).not.toBeNull();
  });

  it("después de MAX_ROUNDS respuestas, 'no se resolvió' cierra; reabrir da una ronda más", async () => {
    const { ticket, staffMod, asAna } = await setup();
    await takeTicket(ticket.id, staffMod);
    for (let i = 0; i < MAX_ROUNDS; i++) {
      await answerTicket(ticket.id, staffMod, `Respuesta ${i}`);
      const status = await addFeedback(ticket.id, asAna, false, null);
      expect(status).toBe(i < MAX_ROUNDS - 1 ? "IN_PROGRESS" : "CLOSED");
    }
    await reopenTicket(ticket.id, staffMod);
    await answerTicket(ticket.id, staffMod, "Una más");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("ANSWERED");
  });

  it("el usuario no ve tickets ajenos ni notas internas", async () => {
    const { beto, ticket, staffMod, asAna } = await setup();
    await addNote(ticket.id, staffMod, "Parece un problema de caché");
    expect(await getTicket(ticket.id, { id: beto.id, staff: false })).toBeNull();
    const own = await getTicket(ticket.id, asAna);
    expect(own!.events.map((e) => e.kind)).toEqual(["CREATED"]);
    const staff = await getTicket(ticket.id, staffMod);
    expect(staff!.events.map((e) => e.kind)).toEqual(["CREATED", "NOTE"]);
  });

  it("cerrar con mensaje avisa al autor; los respondidos sin feedback se cierran solos", async () => {
    const { ana, ticket, staffMod } = await setup();
    await closeTicket(ticket.id, staffMod, "No lo pudimos reproducir.");
    expect(await prisma.notification.count({ where: { userId: ana.id, kind: "ticket.closed" } })).toBe(1);

    const second = await createTicket({ ...input, title: "Otro problema" }, ana);
    await takeTicket(second.id, staffMod);
    await answerTicket(second.id, staffMod, "Mirá esto");
    expect(await autoCloseAnswered(new Date())).toEqual({ closed: 0 });
    expect(await autoCloseAnswered(new Date(Date.now() + 8 * DAY))).toEqual({ closed: 1 });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("CLOSED");
  });

  it("valida el texto y limita los reportes por día", async () => {
    const ana = await makeUser();
    await expect(createTicket({ ...input, title: "Hey" }, ana)).rejects.toThrow();
    for (let i = 0; i < 5; i++) await createTicket(input, ana);
    await expect(createTicket(input, ana)).rejects.toThrow("Ya enviaste 5 reportes");
  });
});
