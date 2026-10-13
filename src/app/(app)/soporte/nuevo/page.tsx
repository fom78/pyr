import { requirePermission } from "@/server/auth/session";
import { safePageUrl } from "@/server/tickets/rules";
import { PageHeader } from "@/components/common";
import { NewTicketForm } from "./new-ticket-form";

export const metadata = { title: "Nuevo reporte" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ desde?: string; tipo?: string }> }) {
  await requirePermission("play");
  const sp = await searchParams;
  const from = safePageUrl(sp.desde);
  return (
    <>
      <PageHeader
        back={{ href: "/soporte", label: "Reportes" }}
        title="Nuevo reporte"
        description="Un error, una sugerencia o lo que quieras contarnos sobre el juego."
      />
      <NewTicketForm pageUrl={from} defaultType={sp.tipo === "SUGGESTION" ? "SUGGESTION" : "BUG"} />
    </>
  );
}
