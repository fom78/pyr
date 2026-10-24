import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpTip } from "@/components/common";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StandingBreakdown } from "./standing-breakdown";

export type StandingRowView = {
  userId: string;
  rank: number;
  previousRank: number | null;
  points: number;
  quizzesCounted: number;
  user: { name: string; username: string | null };
};

/** Nombre y @usuario; con usuario, lleva a su perfil público. */
export function PlayerName({ name, username }: { name: string; username: string | null }) {
  const body = (
    <>
      <span className="block max-w-[40vw] truncate sm:max-w-none">{name}</span>
      {username && <span className="text-muted-foreground text-xs">@{username}</span>}
    </>
  );
  if (!username) return body;
  return (
    <Link href={`/jugadores/${encodeURIComponent(username)}`} className="block hover:underline">
      {body}
    </Link>
  );
}

function Trend({ rank, previous }: { rank: number; previous: number | null }) {
  // Sin puesto anterior: entró a la tabla y desde entonces no cambió de lugar.
  if (previous === null)
    return (
      <span title="Sin cambios desde que entró a la tabla">
        <Minus className="text-muted-foreground size-3.5" aria-label="Sin cambios desde que entró a la tabla" />
      </span>
    );
  if (previous > rank)
    return (
      <span className="text-success inline-flex items-center text-xs" aria-label={`Subió ${previous - rank}`}>
        <ArrowUp className="size-3.5" />
        {previous - rank}
      </span>
    );
  if (previous < rank)
    return (
      <span className="text-destructive inline-flex items-center text-xs" aria-label={`Bajó ${rank - previous}`}>
        <ArrowDown className="size-3.5" />
        {rank - previous}
      </span>
    );
  return <Minus className="text-muted-foreground size-3.5" aria-label="Sin cambios" />;
}

export function StandingsTable({
  rows,
  meId,
  me,
  countedLabel,
  countedHelp,
  breakdown,
}: {
  rows: StandingRowView[];
  meId: string;
  /** Fila del usuario si no aparece entre las mostradas. */
  me?: StandingRowView | null;
  countedLabel: string;
  countedHelp?: React.ReactNode;
  /** Liga: tocar los puntos o la cantidad muestra qué cuestionarios suman. */
  breakdown?: { categoryId: string; tz?: string };
}) {
  const showMeBelow = me && !rows.some((r) => r.userId === me.userId);
  const detail = (r: StandingRowView, value: React.ReactNode) =>
    breakdown ? (
      <StandingBreakdown categoryId={breakdown.categoryId} userId={r.userId} name={r.user.name} tz={breakdown.tz}>
        {value}
      </StandingBreakdown>
    ) : (
      value
    );
  const render = (r: StandingRowView) => (
    <TableRow key={r.userId} className={cn(r.userId === meId && "bg-primary/10 font-medium")}>
      <TableCell className="w-12 text-center tabular-nums">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</TableCell>
      <TableCell>
        <PlayerName name={r.user.name} username={r.user.username} />
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{detail(r, formatNumber(r.points))}</TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">{detail(r, r.quizzesCounted)}</TableCell>
      <TableCell className="w-12 text-center">
        <Trend rank={r.rank} previous={r.previousRank} />
      </TableCell>
    </TableRow>
  );
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-center">#</TableHead>
            <TableHead>Jugador</TableHead>
            <TableHead className="text-right">Puntos</TableHead>
            <TableHead className="hidden text-right sm:table-cell">
              {countedLabel} {countedHelp && <HelpTip>{countedHelp}</HelpTip>}
            </TableHead>
            <TableHead className="text-center">
              <span className="sr-only">Tendencia</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(render)}
          {showMeBelow && (
            <>
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-1 text-center">
                  ⋯
                </TableCell>
              </TableRow>
              {render(me)}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
