import { z } from "zod";
import { prisma, type Db } from "@/server/db";
import type { Prisma, TicketEventKind } from "@/generated/prisma/client";
import { NotFoundError, UserError } from "@/server/errors";
import { logAudit } from "@/server/audit";
import { notifyStaff, notifyStaffUser, notifyUsers } from "@/server/notifications/service";
import {
  AUTO_CLOSE_DAYS,
  DAILY_LIMIT,
  MAX_ROUNDS,
  TYPE_LABEL,
  afterFeedback,
  afterReopen,
  canTicket,
  safePageUrl,
  type TicketAction,
  type TicketViewer,
} from "./rules";

const DAY = 86_400_000;

export const ticketInput = z.object({
  type: z.enum(["BUG", "SUGGESTION", "OTHER"], { error: "Elegí el tipo." }),
  title: z.string().trim().min(5, "Contalo en al menos 5 caracteres.").max(120, "Máximo 120 caracteres."),
  body: z.string().trim().min(10, "Contanos un poco más (mínimo 10 caracteres).").max(4000, "Máximo 4000 caracteres."),
  imageKey: z.string().trim().max(300).optional(),
  pageUrl: z.string().optional(),
});

const text = (min: number, max: number, label: string) =>
  z.string({ error: `${label}: falta el texto.` }).trim().min(min, `${label}: mínimo ${min} caracteres.`).max(max, `${label}: máximo ${max} caracteres.`);
const answerText = text(2, 4000, "La respuesta");
const noteText = text(2, 2000, "La nota");
const feedbackText = z.string().trim().max(500, "El comentario: máximo 500 caracteres.").optional();
const closeText = z.string().trim().max(2000, "El mensaje: máximo 2000 caracteres.").optional();

/** Valida un texto suelto y devuelve el mensaje concreto (no hay campo de formulario al que atarlo). */
function parseText<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Revisá el texto.");
  return r.data;
}

const snippet = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Crea un ticket (jugador no baneado; el permiso `play` lo valida la action). */
export async function createTicket(
  raw: unknown,
  actor: { id: string; name: string },
  meta: { userAgent?: string | null } = {},
  db: Db = prisma,
) {
  const input = ticketInput.parse(raw);
  // Cuenta los enviados (no los intentos): un error al guardar no consume el cupo.
  const today = await db.ticket.count({ where: { userId: actor.id, createdAt: { gt: new Date(Date.now() - DAY) } } });
  if (today >= DAILY_LIMIT)
    throw new UserError(`Ya enviaste ${DAILY_LIMIT} reportes en las últimas 24 horas. Probá de nuevo más tarde.`, "RATE_LIMITED", 429);
  const ticket = await db.ticket.create({
    data: {
      userId: actor.id,
      type: input.type,
      title: input.title,
      body: input.body,
      imageKey: input.imageKey || null,
      pageUrl: safePageUrl(input.pageUrl),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      events: { create: { kind: "CREATED", actorId: actor.id } },
    },
  });
  await notifyStaff(
    {
      level: input.type === "BUG" ? "WARNING" : "INFO",
      kind: "ticket.new",
      title: `${TYPE_LABEL[input.type]} #${ticket.number}: ${snippet(input.title, 80)}`,
      body: `${actor.name} escribió: ${snippet(input.body)}`,
      href: `/admin/soporte/${ticket.id}`,
      dedupeKey: `ticket.new:${ticket.id}`,
    },
    new Date(),
    db,
  );
  return ticket;
}

type Loaded = Prisma.TicketGetPayload<object>;

/**
 * Aplica una acción con control optimista: si otro cambió el ticket en el medio (estado, asignado
 * o rondas), no se pisa y se pide recargar.
 */
async function mutate<T>(
  ticketId: string,
  viewer: TicketViewer,
  action: TicketAction,
  apply: (t: Loaded, tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!t) throw new NotFoundError("Ticket");
    if (!canTicket(t, viewer, action)) throw new UserError(denied(action, t));
    const res = await apply(t, tx);
    return res;
  });
}

function denied(action: TicketAction, t: Loaded) {
  if (action === "answer" && t.rounds >= MAX_ROUNDS) return `Ya se respondió ${MAX_ROUNDS} veces: cerralo o reabrilo.`;
  if (action === "answer") return "Para responder, primero tomá el ticket.";
  if (action === "feedback") return "Este ticket no está esperando tu opinión.";
  return "El ticket cambió mientras tanto. Recargá la página.";
}

async function guardedUpdate(tx: Prisma.TransactionClient, t: Loaded, data: Prisma.TicketUpdateManyMutationInput & { assigneeId?: string | null }) {
  const res = await tx.ticket.updateMany({
    where: { id: t.id, status: t.status, assigneeId: t.assigneeId, rounds: t.rounds },
    data,
  });
  if (!res.count) throw new UserError("El ticket cambió mientras tanto. Recargá la página.");
}

async function addEvent(tx: Prisma.TransactionClient, ticketId: string, kind: TicketEventKind, actorId: string | null, body?: string | null, helpful?: boolean) {
  return tx.ticketEvent.create({ data: { ticketId, kind, actorId, body: body || null, helpful: helpful ?? null } });
}

export async function takeTicket(id: string, viewer: TicketViewer) {
  return mutate(id, viewer, "take", async (t, tx) => {
    await guardedUpdate(tx, t, { status: "IN_PROGRESS", assigneeId: viewer.id });
    await addEvent(tx, id, "TAKEN", viewer.id, t.assigneeId ? "Lo tomó de otra persona del equipo." : null);
    await logAudit({ actorId: viewer.id, action: "ticket.take", entityType: "Ticket", entityId: id, meta: { from: t.assigneeId } }, tx);
  });
}

export async function releaseTicket(id: string, viewer: TicketViewer) {
  return mutate(id, viewer, "release", async (t, tx) => {
    await guardedUpdate(tx, t, { status: "OPEN", assigneeId: null });
    await addEvent(tx, id, "RELEASED", viewer.id);
  });
}

export async function answerTicket(id: string, viewer: TicketViewer, rawBody: unknown) {
  const body = parseText(answerText, rawBody);
  const t = await mutate(id, viewer, "answer", async (t, tx) => {
    await guardedUpdate(tx, t, { status: "ANSWERED", rounds: { increment: 1 } });
    await addEvent(tx, id, "ANSWERED", viewer.id, body);
    await logAudit({ actorId: viewer.id, action: "ticket.answer", entityType: "Ticket", entityId: id }, tx);
    return t;
  });
  await notifyUsers([t.userId], {
    level: "INFO",
    kind: "ticket.answered",
    title: `Te respondimos el ticket #${t.number}`,
    body: snippet(body),
    href: `/soporte/${id}`,
    dedupeKey: `ticket.answered:${id}:${t.rounds + 1}`,
  });
}

/** Feedback del autor a la última respuesta. Devuelve el nuevo estado. */
export async function addFeedback(id: string, viewer: TicketViewer, helpful: boolean, rawComment: unknown) {
  const comment = parseText(feedbackText, rawComment || undefined);
  const { t, status, eventId } = await mutate(id, viewer, "feedback", async (t, tx) => {
    const status = afterFeedback(t, helpful);
    await guardedUpdate(tx, t, { status, ...(status === "CLOSED" ? { closedAt: new Date() } : {}) });
    const ev = await addEvent(tx, id, "FEEDBACK", viewer.id, comment, helpful);
    return { t, status, eventId: ev.id };
  });
  const input = {
    level: helpful ? ("INFO" as const) : ("WARNING" as const),
    kind: "ticket.feedback",
    title: helpful ? `Ticket #${t.number}: le sirvió la respuesta` : `Ticket #${t.number}: no se resolvió`,
    body: [
      comment ? `“${snippet(comment)}”` : null,
      status === "CLOSED" ? "El ticket quedó cerrado." : "Volvió a tu bandeja para responder de nuevo.",
    ]
      .filter(Boolean)
      .join(" "),
    href: `/admin/soporte/${id}`,
    dedupeKey: `ticket.feedback:${eventId}`,
  };
  if (t.assigneeId) await notifyStaffUser(t.assigneeId, input);
  else await notifyStaff(input);
  return status;
}

export async function addNote(id: string, viewer: TicketViewer, rawBody: unknown) {
  const body = parseText(noteText, rawBody);
  return mutate(id, viewer, "note", async (_t, tx) => {
    await addEvent(tx, id, "NOTE", viewer.id, body);
  });
}

/** Cierra el ticket; el mensaje opcional lo ve el autor. */
export async function closeTicket(id: string, viewer: TicketViewer, rawMessage?: unknown) {
  const message = parseText(closeText, rawMessage || undefined);
  const { t, eventId } = await mutate(id, viewer, "close", async (t, tx) => {
    await guardedUpdate(tx, t, { status: "CLOSED", closedAt: new Date() });
    const ev = await addEvent(tx, id, "CLOSED", viewer.id, message);
    await logAudit({ actorId: viewer.id, action: "ticket.close", entityType: "Ticket", entityId: id }, tx);
    return { t, eventId: ev.id };
  });
  await notifyUsers([t.userId], {
    level: "INFO",
    kind: "ticket.closed",
    title: `Cerramos tu ticket #${t.number}`,
    body: message ? snippet(message) : `“${snippet(t.title, 80)}”`,
    href: `/soporte/${id}`,
    dedupeKey: `ticket.closed:${eventId}`,
  });
}

export async function reopenTicket(id: string, viewer: TicketViewer) {
  return mutate(id, viewer, "reopen", async (t, tx) => {
    await guardedUpdate(tx, t, { ...afterReopen(t), closedAt: null });
    await addEvent(tx, id, "REOPENED", viewer.id);
    await logAudit({ actorId: viewer.id, action: "ticket.reopen", entityType: "Ticket", entityId: id }, tx);
  });
}

// ───────────────────────────── Lectura ─────────────────────────────

const PERSON = { select: { id: true, name: true, username: true } } as const;

/** Detalle de un ticket. null si no existe o no es del usuario (y no es staff). Las notas internas solo las ve el staff. */
export async function getTicket(id: string, viewer: TicketViewer, db: Db = prisma) {
  const t = await db.ticket.findUnique({
    where: { id },
    include: {
      user: PERSON,
      assignee: PERSON,
      events: { include: { actor: PERSON }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!t || (!viewer.staff && t.userId !== viewer.id)) return null;
  return { ...t, events: viewer.staff ? t.events : t.events.filter((e) => e.kind !== "NOTE") };
}

export async function listMyTickets(userId: string, db: Db = prisma) {
  return db.ticket.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
}

export type TicketTab = "untaken" | "mine" | "progress" | "answered" | "closed";
export const TICKET_TABS: { value: TicketTab; label: string }[] = [
  { value: "untaken", label: "Sin tomar" },
  { value: "mine", label: "Míos" },
  { value: "progress", label: "En curso" },
  { value: "answered", label: "Respondidos" },
  { value: "closed", label: "Cerrados" },
];

function tabWhere(tab: TicketTab, viewerId: string): Prisma.TicketWhereInput {
  switch (tab) {
    case "untaken":
      return { status: "OPEN" };
    case "mine":
      return { assigneeId: viewerId, status: { in: ["IN_PROGRESS", "ANSWERED"] } };
    case "progress":
      return { status: "IN_PROGRESS" };
    case "answered":
      return { status: "ANSWERED" };
    case "closed":
      return { status: "CLOSED" };
  }
}

export async function listTickets(
  filters: { tab: TicketTab; type?: "BUG" | "SUGGESTION" | "OTHER" },
  viewerId: string,
  db: Db = prisma,
) {
  return db.ticket.findMany({
    where: { ...tabWhere(filters.tab, viewerId), ...(filters.type ? { type: filters.type } : {}) },
    include: { user: PERSON, assignee: PERSON },
    orderBy: filters.tab === "closed" ? { closedAt: "desc" } : { createdAt: "asc" },
    take: 200,
  });
}

export async function ticketTabCounts(viewerId: string, db: Db = prisma) {
  const tabs = TICKET_TABS.filter((t) => t.value !== "closed");
  const counts = await Promise.all(tabs.map((t) => db.ticket.count({ where: tabWhere(t.value, viewerId) })));
  return Object.fromEntries(tabs.map((t, i) => [t.value, counts[i]])) as Partial<Record<TicketTab, number>>;
}

export async function untakenCount(db: Db = prisma) {
  return db.ticket.count({ where: { status: "OPEN" } });
}

/** Respondidos hace más de `AUTO_CLOSE_DAYS` sin feedback: se cierran solos (worker, diario). */
export async function autoCloseAnswered(now = new Date(), db: Db = prisma) {
  const stale = await db.ticket.findMany({
    where: { status: "ANSWERED", updatedAt: { lte: new Date(now.getTime() - AUTO_CLOSE_DAYS * DAY) } },
    select: { id: true },
  });
  let closed = 0;
  for (const { id } of stale) {
    const res = await db.ticket.updateMany({ where: { id, status: "ANSWERED" }, data: { status: "CLOSED", closedAt: now } });
    if (!res.count) continue;
    await db.ticketEvent.create({
      data: { ticketId: id, kind: "CLOSED", body: `Se cerró solo: no hubo respuesta en ${AUTO_CLOSE_DAYS} días.` },
    });
    closed++;
  }
  return { closed };
}

