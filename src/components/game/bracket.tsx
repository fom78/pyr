import Link from "next/link";
import type { BracketView } from "@/server/tournaments/knockout";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Match = BracketView["matches"][number];
type Side = Match["a"];

function PlayerRow({ side, match, meId }: { side: Side; match: Match; meId?: string }) {
  if (!side) return <div className="text-muted-foreground px-2 py-1 text-xs italic">{match.round === 1 ? "pase libre" : "a definir"}</div>;
  const won = match.winnerId === side.id;
  const lost = Boolean(match.winnerId) && !won;
  return (
    <div className={cn("flex items-center justify-between gap-2 px-2 py-1 text-sm", won && "font-semibold", lost && "text-muted-foreground line-through")}>
      <span className="min-w-0 truncate">
        {side.seed && <span className="text-muted-foreground mr-1 text-xs tabular-nums">{side.seed}</span>}
        <Link href={`/jugadores/${side.username ?? ""}`} className={cn("hover:underline", side.id === meId && "text-primary")}>
          {side.username ? `@${side.username}` : side.name}
        </Link>
      </span>
      {side.score != null && <span className="tabular-nums">{side.score}</span>}
    </div>
  );
}

/** Cuadro de una eliminatoria: una columna por ronda (con scroll horizontal en pantallas chicas). */
export function Bracket({ bracket, meId, tz, quizHref }: { bracket: BracketView; meId?: string; tz: string; quizHref?: (quizId: string) => string }) {
  const rounds = Array.from({ length: bracket.rounds }, (_, i) => i + 1);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-4">
        {rounds.map((r) => {
          const matches = bracket.matches.filter((m) => m.round === r);
          return (
            <div key={r} className="flex w-56 flex-col gap-3">
              <h3 className="text-sm font-semibold">
                {matches[0]?.name}
                <span className="text-muted-foreground block text-xs font-normal">{matches[0] && formatDate(matches[0].opensAt, tz, "EEE d/M HH:mm")}</span>
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {matches.map((m) => {
                  const mine = Boolean(meId) && (m.a?.id === meId || m.b?.id === meId);
                  const box = (
                    <div className={cn("divide-y rounded-md border", mine && "border-primary")}>
                      {m.position === 1 && r === bracket.rounds && <p className="text-muted-foreground px-2 py-0.5 text-xs">Tercer puesto</p>}
                      <PlayerRow side={m.a} match={m} meId={meId} />
                      <PlayerRow side={m.b} match={m} meId={meId} />
                      {m.result && m.result !== "PLAYED" && m.result !== "BYE" && (
                        <p className="text-muted-foreground px-2 py-0.5 text-xs">{m.result === "WALKOVER" ? "W.O." : "Por desempate"}</p>
                      )}
                      {quizHref && m.quizId && (
                        <Link href={quizHref(m.quizId)} className="text-primary block px-2 py-0.5 text-xs hover:underline">
                          Ver cuestionario
                        </Link>
                      )}
                    </div>
                  );
                  return <div key={m.id}>{box}</div>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
