import Link from "next/link";
import { Gamepad2, Menu } from "lucide-react";
import { requirePermission, userCan } from "@/server/auth/session";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/layout/logo";
import { unreadCount } from "@/server/notifications/service";
import { untakenCount } from "@/server/tickets/service";
import { AdminNav, type AdminNavItem } from "./admin-nav";

export const metadata = { title: { default: "Administración", template: "%s · Admin PyR" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("admin.access");
  const [settings, users, audit, rules, unread, support, backups] = await Promise.all([
    userCan(user, "settings.manage"),
    userCan(user, "user.list"),
    userCan(user, "audit.view"),
    userCan(user, "rules.edit"),
    unreadCount(user.id, "STAFF"),
    userCan(user, "ticket.manage"),
    userCan(user, "backup.manage"),
  ]);
  const untaken = support ? await untakenCount() : 0;
  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "gauge", exact: true },
    { href: "/admin/notificaciones", label: "Notificaciones", icon: "bell", badge: unread },
    { href: "/admin/categorias", label: "Categorías", icon: "grid" },
    { href: "/admin/preguntas", label: "Preguntas", icon: "help" },
    { href: "/admin/preguntas/cobertura", label: "Cobertura del banco", icon: "database" },
    { href: "/admin/importar", label: "Importar Excel", icon: "upload" },
    { href: "/admin/cuestionarios", label: "Cuestionarios", icon: "list" },
    { href: "/admin/cuestionarios/por-aprobar", label: "Por aprobar", icon: "approve" },
    { href: "/admin/torneos", label: "Torneos", icon: "trophy" },
    { href: "/admin/temporadas", label: "Temporadas", icon: "season" },
    ...(support ? [{ href: "/admin/soporte", label: "Soporte", icon: "support", badge: untaken } as const] : []),
    ...(users ? [{ href: "/admin/usuarios", label: "Usuarios", icon: "users" } as const] : []),
    ...(settings ? [{ href: "/admin/config", label: "Configuración", icon: "settings" } as const] : []),
    ...(rules ? [{ href: "/admin/reglas", label: "Textos de reglas", icon: "book" } as const] : []),
    ...(audit ? [{ href: "/admin/auditoria", label: "Auditoría", icon: "scroll" } as const] : []),
    ...(backups ? [{ href: "/admin/backups", label: "Backups", icon: "backup" } as const] : []),
  ];
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-4 p-4">
          <Link href="/admin" className="text-xl">
            <Logo /> <span className="text-sm font-medium text-muted-foreground">admin</span>
          </Link>
          {/* Con muchas secciones la lista se desplaza; "Volver al juego" queda siempre a la vista. */}
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <AdminNav items={items} />
          </div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Volver al juego
          </Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col gap-0 p-0">
              <SheetTitle className="border-b px-4 py-3">
                <Logo /> admin
              </SheetTitle>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <AdminNav items={items} compact />
              </div>
              <div className="border-t p-2">
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/">
                    <Gamepad2 /> Volver al juego
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Administración</span>
          {unread > 0 && (
            <Link href="/admin/notificaciones" className="ml-auto text-xs font-medium text-destructive">
              {unread} aviso{unread === 1 ? "" : "s"}
            </Link>
          )}
          <span className={`truncate text-xs text-muted-foreground ${unread > 0 ? "" : "ml-auto"}`}>
            {user.name} · {user.role === "ADMIN" ? "Admin" : "Mod"}
          </span>
          <Button asChild variant="ghost" size="icon" aria-label="Volver al juego" title="Volver al juego">
            <Link href="/">
              <Gamepad2 />
            </Link>
          </Button>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
