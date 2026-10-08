import { Ban } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { formatDate } from "@/lib/format";

export async function BanBanner() {
  const user = await getCurrentUser();
  if (!user?.ban) return null;
  return (
    <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <div className="mx-auto flex max-w-5xl items-center gap-2">
        <Ban className="size-4 shrink-0" aria-hidden />
        <span>
          Tu cuenta está suspendida{user.ban.endsAt ? ` hasta el ${formatDate(user.ban.endsAt, user.timezone)}` : ""}. No podés jugar
          ni inscribirte. Motivo: {user.ban.reason}
        </span>
      </div>
    </div>
  );
}
