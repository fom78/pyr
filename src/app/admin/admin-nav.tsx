"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  Bell,
  BookOpen,
  CalendarCheck,
  Database,
  Gauge,
  Grid3x3,
  HelpCircle,
  LifeBuoy,
  List,
  ScrollText,
  Settings,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
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
  bell: Bell,
  approve: CalendarCheck,
  database: Database,
  support: LifeBuoy,
  backup: Archive,
};

export type AdminNavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean; badge?: number };

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
            {item.badge ? (
              <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-semibold text-white tabular-nums">
                {item.badge}
                <span className="sr-only"> sin leer</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
