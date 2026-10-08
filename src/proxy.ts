import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Chequeo optimista (solo presencia de cookie) para redirigir rápido a /ingresar.
// La validación real de sesión, rol y baneo ocurre en el servidor (getCurrentUser / requirePermission).
const PUBLIC_PREFIXES = ["/ingresar", "/registro", "/como-se-juega", "/api/auth", "/api/files", "/api/health"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!getSessionCookie(req)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)"],
};
