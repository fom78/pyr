import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getLivesSummary } from "@/server/league/service";
import { getSettings } from "@/server/config/service";
import { checkJoin } from "@/server/league/lives";
import { HelpTip, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinButton } from "@/components/game/membership-buttons";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const now = new Date();
  const [categories, lives, s] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: { where: { status: "ACTIVE" } } } } },
    }),
    getLivesSummary(user.id, now),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Categorías"
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            Vidas:
            {Array.from({ length: lives.max }, (_, i) => (
              <Heart key={i} className={i < lives.used ? "size-4 fill-destructive text-destructive" : "size-4 text-muted-foreground"} aria-hidden />
            ))}
            <span className="ml-1">
              {lives.free} {lives.free === 1 ? "libre" : "libres"} de {lives.max}
            </span>
            <HelpTip>
              Cada vida te permite participar en una categoría. Al abandonar una, la vida tarda {s["league.leaveCooldownDays"]} días en liberarse.
            </HelpTip>
          </span>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const check = checkJoin(lives.memberships, c.id, lives.max, now);
          const status = !check.ok ? check.reason : null;
          return (
            <Card key={c.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>
                    {c.icon}
                  </span>
                  <Link href={`/categorias/${c.slug}`} className="hover:underline">
                    {c.name}
                  </Link>
                </CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{c._count.memberships} participantes</span>
                {status === "ALREADY_MEMBER" ? (
                  <Badge>Participás</Badge>
                ) : status === "LEAVING" ? (
                  <Badge variant="secondary">En desvinculación</Badge>
                ) : status === "REJOIN_BLOCKED" && !check.ok ? (
                  <Badge variant="outline">Podés volver el {formatDate(check.until!, user.timezone)}</Badge>
                ) : (
                  !user.banned && (
                    <JoinButton
                      categoryId={c.id}
                      categoryName={c.name}
                      livesFree={lives.free}
                      livesMax={lives.max}
                      cooldownDays={s["league.leaveCooldownDays"]}
                      size="sm"
                    />
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
