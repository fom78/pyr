import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coffee } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Colaborar" };

/** Pedido amable de colaboración vía Cafecito (enlace externo: no hay pagos dentro de la app). */
export default async function SupportPage() {
  await requireUser();
  const url = (await getSettings())["support.cafecitoUrl"];
  if (!url) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Colaborar con PyR" description="Si te gusta jugar, podés darnos una mano para mantenerlo andando." />
      <Card>
        <CardContent className="grid gap-4 py-6 text-pretty">
          <p>
            PyR es un proyecto hecho a pulmón: es <strong>gratis y sin publicidad</strong>. Mantenerlo en línea tiene costos de
            todos los meses: servidor, base de datos, backups y dominio.
          </p>
          <p>
            Si querés y podés, invitanos un cafecito. Se paga en Cafecito con Mercado Pago o tarjeta, sin crear cuenta, y{" "}
            <strong>cualquier monto suma</strong>.
          </p>
          <p className="text-muted-foreground text-sm">
            Colaborar no da ventajas en el juego: ni créditos, ni vidas, ni estrellas. La competencia sigue pareja para todos.
          </p>
          <div className="flex justify-center py-2">
            <Button asChild size="lg">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Coffee aria-hidden /> Invitar un cafecito
              </a>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            ¿No podés ahora? No pasa nada: jugar, invitar amigos y{" "}
            <Link href="/soporte/nuevo" className="text-primary underline-offset-2 hover:underline">
              avisarnos si algo falla
            </Link>{" "}
            también ayuda un montón. ¡Gracias!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
