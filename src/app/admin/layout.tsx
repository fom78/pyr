import Link from "next/link";
import { Menu } from "lucide-react";
import { requirePermission, userCan } from "@/server/auth/session";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/layout/logo";
import { AdminNav, type AdminNavItem } from "./admin-nav";

export const metadata = { title: { default: "Administración", template: "%s · Admin PyR" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("admin.access");
  const [settings, users, audit, rules] = await Promise.all([
    userCan(user, "settings.manage"),
    userCan(user, "user.list"),
    userCan(user, "audit.view"),
    userCan(user, "rules.edit"),
  ]);
  const items: AdminNavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "gauge", exact: true },
    { href: "/admin/categorias", label: "Categorías", icon: "grid" },
    { href: "/admin/preguntas", label: "Preguntas", icon: "help" },
    { href: "/admin/importar", label: "Importar Excel", icon: "upload" },
    { href: "/admin/cuestionarios", label: "Cuestionarios", icon: "list" },
    { href: "/admin/torneos", label: "Torneos", icon: "trophy" },
    ...(users ? [{ href: "/admin/usuarios", label: "Usuarios", icon: "users" } as const] : []),
    ...(settings ? [{ href: "/admin/config", label: "Configuración", icon: "settings" } as const] : []),
    ...(rules ? [{ href: "/admin/reglas", label: "Textos de reglas", icon: "book" } as const] : []),
    ...(audit ? [{ href: "/admin/auditoria", label: "Auditoría", icon: "scroll" } as const] : []),
  ];
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-4 p-4">
          <Link href="/admin" className="text-xl">
            <Logo /> <span className="text-sm font-medium text-muted-foreground">admin</span>
          </Link>
          <AdminNav items={items} />
          <Link href="/" className="mt-auto text-sm text-muted-foreground hover:text-foreground">
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
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="mb-4">
                <Logo /> admin
              </SheetTitle>
              <AdminNav items={items} />
              <Link href="/" className="mt-6 block text-sm text-muted-foreground">
                ← Volver al juego
              </Link>
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Administración</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {user.name} · {user.role === "ADMIN" ? "Admin" : "Mod"}
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
