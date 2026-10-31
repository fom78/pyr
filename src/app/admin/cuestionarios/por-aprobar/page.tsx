import Link from "next/link";
import { requirePermission, userCan } from "@/server/auth/session";
import { listPendingDrafts } from "@/server/autoquiz/service";
import {
  countByState,
  filterPending,
  filterPendingBase,
  groupByDay,
  isComplete,
  parsePendingFilters,
  PENDING_STATES,
  PENDING_WINDOWS,
  pendingOwners,
  type PendingState,
} from "@/server/autoquiz/pending";
import { EmptyState, PageHeader } from "@/components/common";
import { AutoFilterForm } from "@/components/forms/auto-filter-form";
import { NativeSelect } from "@/components/forms/native-select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime, fromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DraftRowActions } from "./draft-row-actions";
import { BulkCheckbox, BulkPublish } from "./bulk-publish";

export const metadata = { title: "Por aprobar" };

type SP = Record<string, string | string[] | undefined>;

export default async function PendingDraftsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("quiz.manage");
  const sp = await searchParams;
  const now = new Date();
  const tz = user.timezone;
  const [drafts, canPublish] = await Promise.all([listPendingDrafts(now), userCan(user, "quiz.publish")]);
  const f = parsePendingFilters(sp);
  const base = filterPendingBase(drafts, f, now);
  const counts = countByState(base);
  const shown = filterPending(drafts, f, now);
  const owners = pendingOwners(drafts);
  const hasFilters = Boolean(f.q || f.origin || f.owner || f.state || f.within);
  const approvable = canPublish ? shown.filter(isComplete).map((d) => d.id) : [];

  // Los chips de estado conservan el resto de los filtros.
  const stateHref = (state?: PendingState) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "estado") q.set(k, v);
    if (state) q.set("estado", state);
    const s = q.toString();
    return s ? `?${s}` : "?";
  };
  const today = formatDate(now, tz, "yyyy-MM-dd");
  const tomorrow = formatDate(new Date(now.getTime() + 86_400_000), tz, "yyyy-MM-dd");
  const dayLabel = (day: string, sample: Date) =>
    day === today ? "Hoy" : day === tomorrow ? "Mañana" : formatDate(sample, tz, "EEEE d 'de' MMMM");

  return (
    <>
      <PageHeader
        title="Cuestionarios por aprobar"
        description="Borradores generados por los calendarios automáticos y los torneos. En la liga, si nadie los aprueba, los completos se publican solos antes de abrir (según la configuración) y los demás se saltean. Los de torneo siempre salen."
        back={{ href: "/admin/cuestionarios", label: "Cuestionarios" }}
      />
      {drafts.length === 0 ? (
        <EmptyState title="No hay borradores pendientes" description="Cuando el worker genere los próximos, aparecen acá." />
      ) : (
        <>
          <nav aria-label="Estado" className="mb-3 flex flex-wrap gap-2">
            <StateChip href={stateHref()} active={!f.state} label="Todos" count={counts.total} />
            {(Object.keys(PENDING_STATES) as PendingState[]).map((s) => (
              <StateChip
                key={s}
                href={stateHref(s)}
                active={f.state === s}
                label={PENDING_STATES[s]}
                count={counts[s]}
                tone={s === "urgentes" || s === "incompletos" ? "danger" : undefined}
              />
            ))}
          </nav>

          <AutoFilterForm className="mb-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
            {f.state && <input type="hidden" name="estado" value={f.state} />}
            <div className="grid gap-1">
              <Label htmlFor="q">Buscar</Label>
              <Input id="q" name="q" defaultValue={f.q} placeholder="Título, categoría o torneo" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="origen">Origen</Label>
              <NativeSelect id="origen" name="origen" defaultValue={f.origin ?? ""}>
                <option value="">Liga y torneos</option>
                <option value="liga">Solo liga</option>
                <option value="torneo">Solo torneos</option>
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="de">Categoría o torneo</Label>
              <NativeSelect id="de" name="de" defaultValue={f.owner ?? ""}>
                <option value="">Todos</option>
                {owners
                  .filter((o) => !f.origin || o.tournament === (f.origin === "torneo"))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.icon} {o.name} ({o.count})
                    </option>
                  ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="abre">Abren</Label>
              <NativeSelect id="abre" name="abre" defaultValue={f.within ? String(f.within) : ""}>
                <option value="">Cuando sea</option>
                {Object.entries(PENDING_WINDOWS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </AutoFilterForm>

          <p className="mb-3 text-sm" aria-live="polite">
            <strong className="tabular-nums">{shown.length}</strong> de {drafts.length} borrador{drafts.length === 1 ? "" : "es"}
            {hasFilters && (
              <>
                {" · "}
                <Link href="?" className="text-primary underline-offset-2 hover:underline">
                  Limpiar filtros
                </Link>
              </>
            )}
          </p>

          {shown.length === 0 ? (
            <EmptyState title="Ningún borrador cumple estos filtros" />
          ) : (
            <BulkPublish ids={approvable}>
              <div className="grid gap-5">
                {groupByDay(shown, tz).map((g) => (
                  <section key={g.day} className="grid gap-1.5">
                    <h2 className="text-muted-foreground text-sm font-semibold first-letter:uppercase">
                      {dayLabel(g.day, g.items[0].opensAt)} <span className="font-normal">· {g.items.length}</span>
                    </h2>
                    <ul className="divide-y rounded-lg border">
                      {g.items.map((d) => {
                        const complete = isComplete(d);
                        return (
                          <li
                            key={d.id}
                            className={cn("flex flex-wrap items-center gap-3 px-3 py-2", d.urgent && "bg-destructive/5")}
                          >
                            <span className="w-4">
                              {canPublish && complete && <BulkCheckbox id={d.id} label={`Seleccionar ${d.title}`} />}
                            </span>
                            <div className="grid min-w-0 flex-1 gap-0.5">
                              <Link href={`/admin/cuestionarios/${d.id}`} className="truncate font-medium hover:underline">
                                {d.category.icon} {d.title}
                              </Link>
                              <p className="text-muted-foreground text-xs">
                                Abre {formatDateTime(d.opensAt, tz)} ({fromNow(d.opensAt)}) ·{" "}
                                <span className={cn(!complete && "text-destructive font-medium")}>
                                  {d.questions}/{d.expected} preguntas
                                </span>
                                {d.tournament
                                  ? " · torneo: sale aunque nadie lo apruebe"
                                  : d.autoPublishAt && complete
                                    ? ` · se publica solo el ${formatDateTime(d.autoPublishAt, tz)}`
                                    : " · si nadie lo aprueba, el turno se saltea"}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {d.urgent && <Badge variant="destructive">Urgente</Badge>}
                                {!complete && <Badge variant="destructive">Incompleto</Badge>}
                                {d.reused > 0 && <Badge variant="outline">{d.reused} reutilizada(s)</Badge>}
                                {d.tournament && <Badge variant="secondary">🏆 Torneo</Badge>}
                              </div>
                            </div>
                            <DraftRowActions id={d.id} canPublish={canPublish && complete} />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </BulkPublish>
          )}
        </>
      )}
    </>
  );
}

function StateChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone?: "danger";
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active && "border-primary bg-primary/10 font-medium",
        count === 0 && !active && "opacity-50",
      )}
    >
      {label}
      <span
        className={cn(
          "text-xs tabular-nums",
          tone === "danger" && count > 0 ? "text-destructive font-semibold" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Link>
  );
}
