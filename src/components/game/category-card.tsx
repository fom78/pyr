import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarClock, Flame, Play, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinButton } from "@/components/game/membership-buttons";
import { formatDate, formatDateTime, formatNumber, fromNow } from "@/lib/format";
import { cn } from "@/lib/utils";

type MiniRow = { userId: string; rank: number; points: number; user: { name: string } };

/** Posición, puntos y racha: el mismo bloque en inicio y en la liga. */
export function MemberStats({
  standing,
  streak,
}: {
  standing: { rank: number; previousRank: number | null; points: number } | null;
  streak: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <p className="flex items-center justify-center gap-0.5 text-lg font-bold tabular-nums">
          {standing ? `#${standing.rank}` : "–"}
          {standing?.previousRank && standing.previousRank > standing.rank && <ArrowUp className="size-3.5 text-success" aria-label="Subió" />}
          {standing?.previousRank && standing.previousRank < standing.rank && <ArrowDown className="size-3.5 text-destructive" aria-label="Bajó" />}
        </p>
        <p className="text-xs text-muted-foreground">posición</p>
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums">{standing ? formatNumber(standing.points) : 0}</p>
        <p className="text-xs text-muted-foreground">puntos</p>
      </div>
      <div>
        <p className="flex items-center justify-center gap-0.5 text-lg font-bold tabular-nums">
          <Flame className="size-4 text-warning" aria-hidden />
          {streak}
        </p>
        <p className="text-xs text-muted-foreground">racha</p>
      </div>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Tabla chiquita: podio o el usuario con sus vecinos. */
function MiniTable({ rows, meId }: { rows: MiniRow[]; meId: string }) {
  return (
    <ol className="grid gap-0.5 text-sm">
      {rows.map((r) => {
        const me = r.userId === meId;
        return (
          <li
            key={r.userId}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1",
              me ? "bg-primary/15 font-semibold text-foreground ring-1 ring-primary/40" : "text-muted-foreground",
            )}
          >
            <span className="w-7 shrink-0 text-center tabular-nums">{r.rank <= 3 ? MEDALS[r.rank - 1] : `#${r.rank}`}</span>
            <span className="min-w-0 flex-1 truncate">{me ? "Vos" : r.user.name}</span>
            <span className="tabular-nums">{formatNumber(r.points)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export type CategoryCardData = {
  category: { id: string; slug: string; name: string; icon: string | null; description: string | null };
  participants: number;
  membership: { effective: string; lifeReleasesAt: Date | null } | null;
  join: { ok: true } | { ok: false; reason: string; until?: Date };
  standing: { rank: number; previousRank: number | null; points: number } | null;
  streak: number;
  neighbors: MiniRow[];
  podium: MiniRow[];
  activeQuiz: { closesAt: Date; unplayed: number } | null;
  nextOpensAt: Date | null;
  bestK: number;
  frequencyDays: number;
};

/**
 * Tarjeta de una categoría en la liga. Toda la tarjeta lleva a la categoría (link "estirado" con
 * `after:inset-0`); los botones quedan por encima con `relative z-10` para no anidar elementos interactivos.
 */
export function CategoryCard({
  data,
  meId,
  tz,
  canJoin,
  lives,
  cooldownDays,
}: {
  data: CategoryCardData;
  meId: string;
  tz: string;
  canJoin: boolean;
  lives: { free: number; max: number };
  cooldownDays: number;
}) {
  const { category: c, membership, standing } = data;
  const isMember = membership?.effective === "ACTIVE";
  const isLeaving = membership?.effective === "LEAVING";
  const join = data.join;

  return (
    <Card className={cn("relative flex flex-col transition-colors hover:border-primary/60", isMember && "border-primary/30")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <Link href={`/categorias/${c.slug}`} className="flex min-w-0 items-center gap-2 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
            <span className="text-2xl" aria-hidden>
              {c.icon}
            </span>
            <span className="truncate">{c.name}</span>
          </Link>
          {isMember && data.activeQuiz && data.activeQuiz.unplayed > 0 ? (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{data.activeQuiz.unplayed} nuevo</span>
          ) : isMember ? (
            <Badge variant="secondary" className="shrink-0">
              Participás
            </Badge>
          ) : null}
        </CardTitle>
        {!isMember && c.description && <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
      </CardHeader>

      <CardContent className="mt-auto grid gap-3">
        {isMember ? (
          <>
            <MemberStats standing={standing} streak={data.streak} />
            {data.neighbors.length > 0 ? (
              <MiniTable rows={data.neighbors} meId={meId} />
            ) : (
              <p className="text-center text-xs text-muted-foreground">Jugá un cuestionario para entrar en la tabla.</p>
            )}
          </>
        ) : isLeaving ? (
          <p className="text-sm text-muted-foreground">En desvinculación hasta el {formatDate(membership!.lifeReleasesAt!, tz)}</p>
        ) : (
          data.podium.length > 0 && <MiniTable rows={data.podium} meId={meId} />
        )}

        <ul className="grid gap-1 text-xs text-muted-foreground">
          {data.activeQuiz ? (
            <li className="flex items-center gap-1.5">
              <Play className="size-3.5 text-primary" aria-hidden /> Cuestionario vigente · cierra {fromNow(data.activeQuiz.closesAt)}
            </li>
          ) : data.nextOpensAt ? (
            <li className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" aria-hidden /> Próximo: {formatDateTime(data.nextOpensAt, tz)}
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden /> {data.participants} {data.participants === 1 ? "participante" : "participantes"} · suman los{" "}
            {data.bestK} mejores · uno cada {data.frequencyDays} {data.frequencyDays === 1 ? "día" : "días"}
          </li>
        </ul>

        {!isMember && !isLeaving && (
          <div className="relative z-10 flex justify-end">
            {!join.ok && join.reason === "REJOIN_BLOCKED" && join.until ? (
              <Badge variant="outline">Podés volver el {formatDate(join.until, tz)}</Badge>
            ) : (
              canJoin && (
                <JoinButton
                  categoryId={c.id}
                  categoryName={c.name}
                  livesFree={lives.free}
                  livesMax={lives.max}
                  cooldownDays={cooldownDays}
                  size="sm"
                />
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
