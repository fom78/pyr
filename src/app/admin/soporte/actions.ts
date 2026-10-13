"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/guard";
import {
  addNote,
  answerTicket,
  closeTicket,
  releaseTicket,
  reopenTicket,
  takeTicket,
} from "@/server/tickets/service";
import { formValues, toFormState, type FormState } from "@/server/actions";

async function staff() {
  const user = await authorize("ticket.manage");
  return { id: user.id, staff: true };
}

function refresh(id: string) {
  revalidatePath(`/admin/soporte/${id}`);
  revalidatePath("/admin/soporte");
  revalidatePath("/admin", "layout"); // badge del nav
}

/** Acciones de un botón (tomar, soltar, reabrir). */
export async function ticketQuickAction(id: string, action: "take" | "release" | "reopen"): Promise<FormState> {
  try {
    const viewer = await staff();
    if (action === "take") await takeTicket(id, viewer);
    else if (action === "release") await releaseTicket(id, viewer);
    else await reopenTicket(id, viewer);
    refresh(id);
    return { ok: true, message: action === "take" ? "Lo tomaste." : action === "release" ? "Lo soltaste." : "Ticket reabierto." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function answerTicketAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await answerTicket(id, await staff(), fd.get("body"));
    refresh(id);
    return { ok: true, message: "Respuesta enviada. Le avisamos al usuario." };
  } catch (err) {
    return toFormState(err, formValues(fd));
  }
}

export async function noteTicketAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await addNote(id, await staff(), fd.get("body"));
    refresh(id);
    return { ok: true, message: "Nota guardada." };
  } catch (err) {
    return toFormState(err, formValues(fd));
  }
}

export async function closeTicketAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await closeTicket(id, await staff(), fd.get("body"));
    refresh(id);
    return { ok: true, message: "Ticket cerrado." };
  } catch (err) {
    return toFormState(err, formValues(fd));
  }
}
