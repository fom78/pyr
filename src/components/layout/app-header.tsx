import Link from "next/link";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, userCan } from "@/server/auth/session";
import { getBalance } from "@/server/credits/service";
import { fileUrl } from "@/server/storage";
import { formatNumber } from "@/lib/format";
import { Logo } from "./logo";
import { TopNavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

export async function AppHeader() {
  const user = await getCurrentUser();
  const [balance, showAdmin] = user ? await Promise.all([getBalance(user.id), userCan(user, "admin.access")]) : [0, false];
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
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
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums hover:bg-accent"
                aria-label={`${balance} créditos`}
              >
                <Coins className="size-4 text-warning" aria-hidden />
                {formatNumber(balance)}
              </Link>
              <UserMenu name={user.name} username={user.username} image={user.image ? fileUrl(user.image) : null} showAdmin={showAdmin} />
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
