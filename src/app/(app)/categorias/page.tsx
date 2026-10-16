import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { getLeagueOverview } from "@/server/player/queries";
import { getSettings } from "@/server/config/service";
import { HelpTip, PageHeader } from "@/components/common";
import { CategoryCard } from "@/components/game/category-card";
import { LivesHearts } from "@/components/game/lives-hearts";

export const metadata: Metadata = { title: "Liga" };

export default async function LeaguePage() {
  const user = await requireUser();
  const [{ items, lives }, s] = await Promise.all([getLeagueOverview(user.id), getSettings()]);
  const mine = items.filter((i) => i.membership);
  const others = items.filter((i) => !i.membership);
  const card = (i: (typeof items)[number]) => (
    <CategoryCard
      key={i.category.id}
      data={i}
      meId={user.id}
      tz={user.timezone}
      canJoin={!user.banned}
      lives={lives}
      cooldownDays={s["league.leaveCooldownDays"]}
    />
  );

  return (
    <>
      <PageHeader
        title="Liga"
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            Elegí tus categorías y competí en cada una. Vidas:
            <LivesHearts used={lives.used} free={lives.free} locked={lives.locked} />
            <span className="ml-1">
              {lives.free} {lives.free === 1 ? "libre" : "libres"} de {lives.max}
            </span>
            {lives.canExchange && (
              <Link href="/creditos#estrellas" className="ml-1 text-primary underline-offset-4 hover:underline">
                Desbloquear otra con ⭐
              </Link>
            )}
            <HelpTip>
              Cada vida te permite participar en una categoría. Al abandonar una, la vida tarda {s["league.leaveCooldownDays"]} días en liberarse.
            </HelpTip>
          </span>
        }
      />
      {mine.length > 0 && (
        <section className="mb-8 grid gap-3">
          <h2 className="font-semibold">Mis categorías</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(card)}</div>
        </section>
      )}
      {others.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-semibold">{mine.length > 0 ? "Otras categorías" : "Categorías"}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{others.map(card)}</div>
        </section>
      )}
    </>
  );
}
