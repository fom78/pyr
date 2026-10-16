import { notFound } from "next/navigation";
import { requirePermission, userCan } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getBalance } from "@/server/credits/service";
import { getLifeStatus, listInventoryTransactions } from "@/server/inventory/service";
import { isBanActive } from "@/server/users/bans";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatNumber } from "@/lib/format";
import { AdjustCreditsForm, AdjustStarsForm, BanForm, ExtraLifeForm, RevokeBanButton, RoleForm } from "./forms";
import { ROLE_LABEL } from "../labels";

export const metadata = { title: "Usuario" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("user.list");
  const { id } = await params;
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      accounts: { select: { providerId: true } },
      bans: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
      memberships: { include: { category: true }, orderBy: { joinedAt: "desc" } },
      creditTransactions: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { attempts: true } },
    },
  });
  if (!u) notFound();
  const [balance, lives, inventory, canRole, canBan, canCredits, canInventory] = await Promise.all([
    getBalance(u.id),
    getLifeStatus(u.id),
    listInventoryTransactions(u.id, 20),
    userCan(actor, "user.setRole"),
    userCan(actor, "user.ban"),
    userCan(actor, "credits.adjust"),
    userCan(actor, "inventory.adjust"),
  ]);
  const tz = actor.timezone;
  const activeBan = u.bans.find((b) => isBanActive(b));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/usuarios", label: "Usuarios" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {u.name} <Badge>{ROLE_LABEL[u.role]}</Badge> {activeBan && <Badge variant="destructive">Baneado</Badge>}
          </span>
        }
        description={`@${u.username ?? "—"} · ${u.email.endsWith("@sin-email.invalid") ? "sin email" : u.email} · alta ${formatDateTime(u.createdAt, tz)} · ingresa con ${u.accounts.map((a) => (a.providerId === "credential" ? "contraseña" : a.providerId)).join(" y ")}`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              Saldo: <strong>{formatNumber(balance)} créditos</strong> · {formatNumber(lives.stars)} ⭐ · {u._count.attempts} intentos
            </p>
            <p>
              Vidas: <strong>{lives.capacity}</strong> de {lives.cap} ({lives.base} iniciales + {lives.extraLives} extra) · usa {lives.used}
            </p>
            <p>
              Categorías:{" "}
              {u.memberships.length
                ? u.memberships.map((m) => `${m.category.name} (${m.status === "ACTIVE" ? "activa" : m.status === "LEAVING" ? "saliendo" : "salió"})`).join(", ")
                : "ninguna"}
            </p>
            {canRole && <RoleForm userId={u.id} role={u.role} />}
          </CardContent>
        </Card>

        {canBan && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Baneos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {activeBan ? (
                <div className="grid gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p>
                    <strong>Baneado</strong> {activeBan.endsAt ? `hasta ${formatDateTime(activeBan.endsAt, tz)}` : "en forma permanente"}. Motivo:{" "}
                    {activeBan.reason}
                  </p>
                  <RevokeBanButton userId={u.id} banId={activeBan.id} />
                </div>
              ) : (
                u.role !== "ADMIN" && <BanForm userId={u.id} />
              )}
              {u.bans.length > 0 && (
                <ul className="grid gap-1 text-xs text-muted-foreground">
                  {u.bans.map((b) => (
                    <li key={b.id}>
                      {formatDateTime(b.startsAt, tz)} → {b.endsAt ? formatDateTime(b.endsAt, tz) : "permanente"} · {b.reason} · por {b.createdBy.name}
                      {b.revokedAt && ` · levantado ${formatDateTime(b.revokedAt, tz)}`}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {canCredits && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ajustar créditos</CardTitle>
            </CardHeader>
            <CardContent>
              <AdjustCreditsForm userId={u.id} />
            </CardContent>
          </Card>
        )}

        {canInventory && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vidas y estrellas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <p className="text-muted-foreground text-xs">
                  Las vidas extra son permanentes. Quitar una que está en uso no lo saca de ninguna categoría: solo no puede sumar otra.
                </p>
                <ExtraLifeForm userId={u.id} canGive={lives.capacity < lives.cap} canTake={lives.extraLives > 0} />
              </div>
              <AdjustStarsForm userId={u.id} />
              {inventory.length > 0 && (
                <ul className="grid gap-1 text-sm">
                  {inventory.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {t.reason}
                        {t.createdBy && <span className="text-muted-foreground text-xs"> · {t.createdBy.name}</span>}
                      </span>
                      <span className={t.amount > 0 ? "text-success tabular-nums" : "text-destructive tabular-nums"}>
                        {t.amount > 0 ? "+" : ""}
                        {t.amount} {t.asset === "STAR" ? "⭐" : "❤"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos movimientos de créditos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {u.creditTransactions.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate">{t.reason}</span>
                  <span className={t.amount > 0 ? "text-success tabular-nums" : "text-destructive tabular-nums"}>
                    {t.amount > 0 ? "+" : ""}
                    {t.amount}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
