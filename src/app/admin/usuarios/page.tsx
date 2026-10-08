import Link from "next/link";
import { Search } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { activeBanWhere } from "@/server/users/bans";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { EmptyState, PageHeader, Pager, parsePage, str } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/forms/native-select";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "./labels";

export const metadata = { title: "Usuarios" };

const PAGE_SIZE = 25;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("user.list");
  const sp = await searchParams;
  const q = str(sp.q)?.trim();
  const role = str(sp.role) as Role | undefined;
  const banned = sp.banned === "1";
  const page = parsePage(sp.page);
  const now = new Date();
  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ username: { contains: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    ...(role ? { role } : {}),
    ...(banned ? { bans: { some: activeBanWhere(now) } } : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { bans: { where: activeBanWhere(now), take: 1 }, _count: { select: { attempts: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader title="Usuarios" description={`${total} resultados`} />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border p-3" role="search">
        <Input name="q" defaultValue={q} placeholder="Usuario, nombre o email" className="min-w-48 flex-1" aria-label="Buscar" />
        <NativeSelect name="role" defaultValue={role ?? ""} className="w-auto" aria-label="Rol">
          <option value="">Todos los roles</option>
          <option value="ADMIN">Admin</option>
          <option value="MOD">Mod</option>
          <option value="USER">Usuario</option>
        </NativeSelect>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="banned" value="1" defaultChecked={banned} className="size-4" /> Solo baneados
        </label>
        <Button type="submit" variant="secondary">
          <Search /> Buscar
        </Button>
      </form>
      {users.length === 0 ? (
        <EmptyState title="Sin resultados" />
      ) : (
        <ul className="grid gap-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/usuarios/${u.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 hover:bg-accent/50">
                <div className="grid gap-0.5">
                  <span className="font-medium">
                    {u.name} {u.username && <span className="text-muted-foreground">@{u.username}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Alta {formatDate(u.createdAt, user.timezone)} · {u._count.attempts} intentos
                  </span>
                </div>
                <span className="flex gap-1">
                  {u.bans.length > 0 && <Badge variant="destructive">Baneado</Badge>}
                  <Badge variant={u.role === "USER" ? "secondary" : "default"}>{ROLE_LABEL[u.role]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} searchParams={sp} basePath="/admin/usuarios" />
    </>
  );
}
