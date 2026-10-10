import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getCategoryStandingsPage } from "@/server/player/queries";
import { EmptyState, PageHeader } from "@/components/common";
import { StandingsTable } from "@/components/game/standings-table";

export const metadata: Metadata = { title: "Tabla" };

export default async function CategoryStandingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const data = await getCategoryStandingsPage(slug, user.id);
  if (!data) notFound();
  const { category, standings, myStanding, total, settings: s } = data;
  const bestK = s["ranking.bestK"];

  return (
    <>
      <PageHeader
        back={{ href: `/categorias/${category.slug}`, label: category.name }}
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden>{category.icon}</span> Tabla de {category.name}
          </span>
        }
        description={`${total} ${total === 1 ? "jugador" : "jugadores"} · suman los ${bestK} mejores de los últimos ${s["ranking.windowDays"]} días${total > standings.length ? ` · se muestran los primeros ${standings.length}` : ""}`}
      />
      {standings.length === 0 ? (
        <EmptyState title="La tabla todavía está vacía" description="Se llena apenas alguien termina un cuestionario." />
      ) : (
        <StandingsTable rows={standings} meId={user.id} me={myStanding} countedLabel={`Mejores ${bestK}`} />
      )}
    </>
  );
}
