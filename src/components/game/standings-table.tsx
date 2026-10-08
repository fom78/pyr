import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpTip } from "@/components/common";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StandingRowView = {
  userId: string;
  rank: number;
  previousRank: number | null;
  points: number;
  quizzesCounted: number;
  user: { name: string; username: string | null };
};

function Trend({ rank, previous }: { rank: number; previous: number | null }) {
  if (previous === null) return <span className="text-xs text-muted-foreground">nuevo</span>;
  if (previous > rank)
    return (
      <span className="inline-flex items-center text-xs text-success" aria-label={`Subió ${previous - rank}`}>
        <ArrowUp className="size-3.5" />
        {previous - rank}
      </span>
    );
  if (previous < rank)
    return (
      <span className="inline-flex items-center text-xs text-destructive" aria-label={`Bajó ${rank - previous}`}>
        <ArrowDown className="size-3.5" />
        {rank - previous}
      </span>
    );
  return <Minus className="size-3.5 text-muted-foreground" aria-label="Sin cambios" />;
}

export function StandingsTable({
  rows,
  meId,
  me,
  countedLabel,
  countedHelp,
}: {
  rows: StandingRowView[];
  meId: string;
  /** Fila del usuario si no aparece entre las mostradas. */
  me?: StandingRowView | null;
  countedLabel: string;
  countedHelp?: React.ReactNode;
}) {
  const showMeBelow = me && !rows.some((r) => r.userId === me.userId);
  const render = (r: StandingRowView) => (
    <TableRow key={r.userId} className={cn(r.userId === meId && "bg-primary/10 font-medium")}>
      <TableCell className="w-12 text-center tabular-nums">
        {r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}
      </TableCell>
      <TableCell>
        <span className="block max-w-[40vw] truncate sm:max-w-none">{r.user.name}</span>
        {r.user.username && <span className="text-xs text-muted-foreground">@{r.user.username}</span>}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{formatNumber(r.points)}</TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.quizzesCounted}</TableCell>
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
                <TableCell colSpan={5} className="py-1 text-center text-muted-foreground">
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
