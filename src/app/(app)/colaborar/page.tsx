import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Coffee } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/config/service";
import { supportOptions } from "@/server/support/links";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Colaborar" };

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * Pedido amable de colaboración: links de pago de Mercado Pago (uno por monto, abren directo el pago)
 * y/o Cafecito. Son enlaces externos: no hay pagos dentro de la app.
 */
export default async function SupportPage() {
  await requireUser();
  const { visible, mp, cafecito } = supportOptions(await getSettings());
  if (!visible) notFound();

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
            Si querés y podés, invitanos un cafecito: <strong>cualquier monto suma</strong>.
          </p>
          <p className="text-muted-foreground text-sm">
            Colaborar no da ventajas en el juego: ni créditos, ni vidas, ni estrellas. La competencia sigue pareja para todos.
          </p>

          {mp.length > 0 && (
            <div className="grid gap-2 py-2">
              <p className="text-center text-sm font-medium">Elegí un monto y pagá con Mercado Pago</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {mp.map((l) => (
                  <Button key={l.url} asChild size="lg" variant="outline" className="h-auto py-3">
                    <a href={l.url} {...external}>
                      {l.label}
                    </a>
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-center text-xs">
                Se abre el pago de Mercado Pago (con tu cuenta, tarjeta o dinero en cuenta).
              </p>
            </div>
          )}

          {cafecito && (
            <div className="flex flex-col items-center gap-1 py-1">
              {mp.length > 0 && <p className="text-muted-foreground text-sm">¿Preferís otro monto o dejar un mensaje?</p>}
              <Button asChild size={mp.length ? "default" : "lg"} variant={mp.length ? "ghost" : "default"}>
                <a href={cafecito} {...external}>
                  <Coffee aria-hidden /> Invitar un cafecito en Cafecito
                </a>
              </Button>
            </div>
          )}

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
