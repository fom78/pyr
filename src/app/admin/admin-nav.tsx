"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarRange,
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
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { SheetClose } from "@/components/ui/sheet";
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
  season: CalendarRange,
};

export type AdminNavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean; badge?: number };

/** `compact`: versión del menú del celular (más apretada y cierra el panel al tocar una sección). */
export function AdminNav({ items, compact }: { items: AdminNavItem[]; compact?: boolean }) {
  const pathname = usePathname();
  const Wrap = compact ? ({ children }: { children: React.ReactNode }) => <SheetClose asChild>{children}</SheetClose> : Fragment;
  return (
    <nav aria-label="Administración" className={compact ? "grid gap-0.5" : "grid gap-1"}>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Wrap key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-2 rounded-md px-3 text-sm font-medium",
                compact ? "py-1.5" : "py-2",
                active && "bg-accent text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
              {item.badge ? (
                <span className="bg-destructive ml-auto rounded-full px-1.5 text-xs font-semibold text-white tabular-nums">
                  {item.badge}
                  <span className="sr-only"> sin leer</span>
                </span>
              ) : null}
            </Link>
          </Wrap>
        );
      })}
    </nav>
  );
}
