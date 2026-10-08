import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { EmptyState, PageHeader, Pager, parsePage, str } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/forms/native-select";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Auditoría" };

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("audit.view");
  const sp = await searchParams;
  const action = str(sp.action);
  const entity = str(sp.entity);
  const actor = str(sp.actor)?.trim();
  const page = parsePage(sp.page);
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(entity ? { entityType: entity } : {}),
    ...(actor ? { actor: { OR: [{ username: { contains: actor.toLowerCase() } }, { name: { contains: actor, mode: "insensitive" } }] } } : {}),
  };
  const [total, logs, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, username: true } } },
    }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true } }),
  ]);
  return (
    <>
      <PageHeader title="Auditoría" description="Quién hizo qué y cuándo." />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <Input name="action" defaultValue={action} placeholder="Acción (ej. ban, credits, quiz.publish)" className="min-w-48 flex-1" aria-label="Acción" />
        <NativeSelect name="entity" defaultValue={entity ?? ""} className="w-auto" aria-label="Entidad">
          <option value="">Todas las entidades</option>
          {actions.map((a) => (
            <option key={a.entityType} value={a.entityType}>
              {a.entityType}
            </option>
          ))}
        </NativeSelect>
        <Input name="actor" defaultValue={actor} placeholder="Usuario que actuó" className="w-48" aria-label="Actor" />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {logs.length === 0 ? (
        <EmptyState title="Sin registros" />
      ) : (
        <ul className="grid gap-1.5">
          {logs.map((l) => (
            <li key={l.id} className="rounded-md border p-2 text-sm">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-mono text-xs">{l.action}</span>
                  <span className="text-muted-foreground">
                    {l.entityType}
                    {l.entityId ? ` · ${l.entityId.slice(0, 10)}…` : ""}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {l.actor ? `${l.actor.name} (@${l.actor.username})` : "sistema"} · {formatDateTime(l.createdAt, user.timezone)}
                  </span>
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify({ before: l.before, after: l.after, meta: l.meta, entityId: l.entityId }, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} searchParams={sp} basePath="/admin/auditoria" />
    </>
  );
}
