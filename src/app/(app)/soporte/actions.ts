"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/server/auth/guard";
import { addFeedback, createTicket } from "@/server/tickets/service";
import { formValues, toFormState, type FormState } from "@/server/actions";

export async function createTicketAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  let id: string;
  try {
    const user = await authorize("play");
    const ticket = await createTicket(
      {
        type: fd.get("type"),
        title: fd.get("title"),
        body: fd.get("body"),
        imageKey: fd.get("imageKey") || undefined,
        pageUrl: fd.get("pageUrl") || undefined,
      },
      user,
      { userAgent: (await headers()).get("user-agent") },
    );
    id = ticket.id;
  } catch (err) {
    return toFormState(err, values);
  }
  revalidatePath("/soporte");
  redirect(`/soporte/${id}?enviado=1`);
}

/** Feedback del autor a la última respuesta (botón "Me sirvió" / "No se resolvió"). */
export async function ticketFeedbackAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  try {
    const user = await authorize("play");
    const status = await addFeedback(id, { id: user.id, staff: false }, fd.get("helpful") === "yes", fd.get("comment"));
    revalidatePath(`/soporte/${id}`);
    revalidatePath("/soporte");
    return {
      ok: true,
      message: status === "CLOSED" ? "¡Gracias! El ticket quedó cerrado." : "Gracias. Le avisamos al equipo para que lo vuelva a mirar.",
    };
  } catch (err) {
    return toFormState(err, values);
  }
}
