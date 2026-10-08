"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Gauge, Grid3x3, HelpCircle, List, ScrollText, Settings, Trophy, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive } from "@/components/layout/nav-items";

const ICONS = {
  gauge: Gauge,
  grid: Grid3x3,
  help: HelpCircle,
  upload: Upload,
  list: List,
  trophy: Trophy,
  users: Users,
  settings: Settings,
  book: BookOpen,
  scroll: ScrollText,
};

export type AdminNavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Administración" className="grid gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
              active && "bg-accent text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
