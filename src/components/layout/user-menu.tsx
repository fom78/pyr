"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Coins, History, LogOut, Moon, Shield, Sun, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(auth)/actions";

type Props = {
  name: string;
  username: string | null;
  image: string | null;
  showAdmin: boolean;
};

export function UserMenu({ name, username, image, showAdmin }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menú de usuario">
          <Avatar className="size-8">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate font-medium">{name}</div>
          {username && <div className="truncate text-xs font-normal text-muted-foreground">@{username}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <User /> Perfil y ajustes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/historial">
            <History /> Mis intentos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/creditos">
            <Coins /> Créditos
          </Link>
        </DropdownMenuItem>
        {showAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield /> Panel de administración
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun /> : <Moon />} Modo {resolvedTheme === "dark" ? "claro" : "oscuro"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Salir
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
