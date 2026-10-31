import Link from "next/link";
import { Bell, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, userCan } from "@/server/auth/session";
import { getBalance } from "@/server/credits/service";
import { getSettings } from "@/server/config/service";
import { supportOptions } from "@/server/support/links";
import { unreadCount } from "@/server/notifications/service";
import { fileUrl } from "@/server/storage";
import { formatNumber } from "@/lib/format";
import { Logo } from "./logo";
import { TopNavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

export async function AppHeader() {
  const user = await getCurrentUser();
  const [balance, showAdmin, unread, settings] = user
    ? await Promise.all([getBalance(user.id), userCan(user, "admin.access"), unreadCount(user.id, "PLAYER"), getSettings()])
    : [0, false, 0, null];
  return (
    <header className="bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/" aria-label="PyR, inicio" className="text-xl">
          <Logo />
        </Link>
        {user && <TopNavLinks />}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/creditos"
                className="hover:bg-accent flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums"
                aria-label={`${balance} créditos`}
              >
                <Coins className="text-warning size-4" aria-hidden />
                {formatNumber(balance)}
              </Link>
              <Link
                href="/notificaciones"
                className="hover:bg-accent relative flex size-9 items-center justify-center rounded-full"
                aria-label={unread ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
              >
                <Bell className="size-5" aria-hidden />
                {unread > 0 && (
                  <span className="bg-destructive absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <UserMenu
                name={user.name}
                username={user.username}
                image={user.image ? fileUrl(user.image) : null}
                showAdmin={showAdmin}
                showSupport={settings ? supportOptions(settings).visible : false}
              />
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/ingresar">Ingresar</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
