import { BookOpen, Grid3x3, House, Trophy, User } from "lucide-react";

export const playerNav = [
  { href: "/", label: "Inicio", icon: House, exact: true },
  { href: "/categorias", label: "Liga", icon: Grid3x3 },
  { href: "/torneos", label: "Torneos", icon: Trophy },
  { href: "/como-se-juega", label: "Reglas", icon: BookOpen },
  { href: "/perfil", label: "Perfil", icon: User },
] as const;

export function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
