import Link from "next/link";
import type { BankCoverage } from "@/server/autoquiz/service";
import type { CoverageLevel } from "@/server/autoquiz/coverage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL: Record<CoverageLevel, { label: string; className: string }> = {
  OK: { label: "Alcanza", className: "bg-success/15 text-success" },
  WARNING: { label: "Cargar preguntas", className: "bg-warning/20 text-warning-foreground dark:text-warning" },
  CRITICAL: { label: "Urgente", className: "bg-destructive/15 text-destructive" },
};

export function CoverageBadge({ level }: { level: CoverageLevel }) {
  return <Badge className={cn("border-transparent", LEVEL[level].className)}>{LEVEL[level].label}</Badge>;
}

function Num({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-md border px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}

/** Resumen de cobertura del banco de una categoría (se usa en la página de cobertura y en la categoría). */
export function CoverageView({ c, tz, showSlots = true }: { c: BankCoverage; tz: string; showSlots?: boolean }) {
  const cov = c.coverage;
  const day = (d: Date | null) => (d ? formatDate(d, tz, "EEE d/M") : "—");
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Num label="Nunca usadas" value={c.fresh} hint={`+${c.reservedInDrafts} en borradores`} />
        <Num label="Reutilizables" value={c.reusable} />
        <Num label="Nuevas alcanzan hasta" value={day(cov.freshCoveredUntil)} />
        <Num label="Con reutilizadas, hasta" value={day(cov.totalCoveredUntil)} />
      </div>
      {cov.freshShortfall > 0 ? (
        <p className="text-sm">
          Para los turnos de los próximos {c.warnDays} días faltan <strong>{cov.freshShortfall}</strong> preguntas nuevas (aprox.)
          {c.reusable > 0 &&
            (cov.totalShortfall
              ? `; aun reutilizando faltan ${cov.totalShortfall}.`
              : "; se pueden cubrir reutilizando preguntas viejas.")}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">Las preguntas nuevas cubren los turnos de los próximos {c.warnDays} días.</p>
      )}
      {c.mix && (
        <p className="text-muted-foreground text-xs">
          Nuevas por dificultad:{" "}
          {[1, 2, 3, 4, 5]
            .map((d) => `${d}: ${c.freshByDifficulty[d] ?? 0}${c.mix?.[d] ? ` (pide ${c.mix[d]})` : ""}`)
            .join(" · ")}
        </p>
      )}
      {showSlots && c.upcoming.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {c.upcoming.map((u) => (
            <li key={u.at.toISOString()} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
              <span className="tabular-nums">{formatDateTime(u.at, tz)}</span>
              <span className="text-muted-foreground text-xs">
                {u.status === "published"
                  ? "publicado"
                  : u.status === "draft"
                    ? `borrador (${u.questions}/${c.perQuiz})`
                    : "se genera más adelante"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/preguntas/nueva">Cargar pregunta</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/importar">Importar Excel</Link>
        </Button>
      </div>
    </div>
  );
}
