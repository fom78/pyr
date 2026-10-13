import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { openNotification } from "@/server/notifications/service";

type Ctx = { params: Promise<{ id: string }> };

/** Solo rutas internas: evita usar el link de una notificación como redirección abierta. */
function safePath(href: string | null | undefined) {
  return href && href.startsWith("/") && !href.startsWith("//") ? href : null;
}

/**
 * Abrir una notificación: la marca como leída y lleva a su destino (o a la lista si no tiene).
 * Se usa con un <a> común (no <Link>) para que el prefetch no la marque sin abrirla.
 */
export async function GET(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/ingresar", req.url));
  const { id } = await ctx.params;
  const n = await openNotification(user.id, id);
  const list = n?.audience === "STAFF" ? "/admin/notificaciones" : "/notificaciones";
  const res = NextResponse.redirect(new URL(safePath(n?.href) ?? list, req.url));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
